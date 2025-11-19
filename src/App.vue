<!-- Что-то более менее работчее, кроме бага с тем что без задержуи при включении камеры вылетает (считаю не критичным) -->
<template>
  <div class="wrapper">
    <div class="sidebar-left">
      <!-- Кнопка ручного добавления участника -->
      <button @click="addParticipant" class="add-btn">+ Добавить</button>

      <!-- Кнопка запуска/остановки симуляции (рандомные действия) -->
      <button @click="toggleSimulation" :class="['simulation-btn', { active: isSimulationRunning }]">
        {{ isSimulationRunning ? '⏹️ Остановить' : '▶️ Симуляция' }}
      </button>

      <!-- Левый список всех участников (включая меня) -->
      <ParticipantsList :participants="allParticipantsForList" @toggle-mic="toggleMic" @toggle-cam="toggleCam"
        @toggle-speaking="toggleSpeaking" @remove-participant="removeParticipant" />
    </div>

    <div class="grid-area">
      <!-- Пагинация влево от второй страницы и дальше -->
      <button v-if="hasPrevPage" @click="prevPage" class="nav-btn nav-prev">
        ←
      </button>

      <!-- Основная видеосетка.
           На первой странице показывает stage (топ-11 отсортированных по силе),
           дальше — остальных постранично -->
      <Grid :participants="sortedParticipants" @toggle-mic="toggleMic" @toggle-cam="toggleCam"
        @toggle-speaking="toggleSpeaking" @remove-participant="removeParticipant" />

      <!-- Пагинация вправо -->
      <button v-if="hasNextPage" @click="nextPage" class="nav-btn nav-next">
        →
      </button>

      <!-- Индикатор страницы -->
      <div class="page-indicator">
        Страница {{ currentPage }} из {{ totalPages }}
      </div>
    </div>
  </div>
</template>

<script>
import Grid from './Grid.vue';
import ParticipantsList from './ParticipantsList.vue';
import { useMediaStore } from './stores/media'; // (пока не используется в этой версии)
import { throttle } from 'lodash';

export default {
  components: {
    Grid,
    ParticipantsList
  },

  data() {
    return {
      currentPage: 1,                 // Текущая страница правой части (1 = stage, 2+ = остальные)
      participants: {},               // Словарь по id -> { id, name, mic, cam, pinned }
      participantsOrder: [],          // Линейный порядок всех участников (кроме меня). Он база "кто вообще присутствует"
      stage: [],                      // Массив id тех, кто сейчас в топ-11 (будут показаны на странице 1)
      gracePeriodTimers: {},          // { [id]: timeoutId } - активные grace таймеры по микрофону
      nextJoinOrder: 1,               // Инкремент для генерации новых user_N
      isSimulationRunning: false,     // Включен ли автосимулятор
      simulationInterval: null,       // setInterval хендл для симулятора

      // Имена для рандомных фейковых людей
      firstNames: [
        'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Елена', 'Иван',
        'Ольга', 'Андрей', 'Татьяна', 'Максим', 'Наталья',
        'Павел', 'Юлия', 'Владимир', 'Петр'
      ],
      lastNames: [
        'Иванов', 'Петров', 'Сидоров', 'Смирнов', 'Козлов',
        'Новиков', 'Морозов', 'Волков', 'Соколов', 'Лебедев',
        'Попов', 'Васильев', 'Федоров', 'Михайлов', 'Семенов'
      ]
    }
  },

  computed: {
    /*
      Это то, что пойдет прямо в <Grid/>.

      ВАЖНО:
      - На всех страницах мы принудительно добавляем "меня" как первого участника (id='me').
      - На первой странице показываем stage (топ-11).
      - На последующих страницах — людей, которых нет в stage.

      PAGE_SIZE = 11 → сцена всегда максимум 11 человек.
    */
    sortedParticipants() {
      const me = { id: 'me', name: 'Алексей', mic: true, cam: true, speaking: false };
      const PAGE_SIZE = 11;

      // Если всего участников <= 11,
      // то stage не используется вообще,
      // и мы просто рендерим всех подряд.
      if (this.participantsOrder.length <= PAGE_SIZE) {
        const all = this.participantsOrder.map(id => this.participants[id]);
        return [me, ...all];
      }

      // Первая страница → показываем stage
      if (this.currentPage === 1) {
        const onStage = this.stage.map(id => this.participants[id]);
        return [me, ...onStage];
      }

      // Остальные страницы → показываем offStage постранично
      const offStage = this.participantsOrder.filter(id => !this.stage.includes(id));
      const startIndex = (this.currentPage - 2) * PAGE_SIZE;
      const endIndex = startIndex + PAGE_SIZE;
      const pageIds = offStage.slice(startIndex, endIndex);
      const pageParticipants = pageIds.map(id => this.participants[id]);

      return [me, ...pageParticipants];
    },

    /*
      Этот список уходит в левую панель (ParticipantsList).
      Там мы всегда хотим видеть "меня" вверху, потом всех остальных.
      pinned = true для меня, чтобы UI мог пометить меня как зафиксированного.
    */
    allParticipantsForList() {
      const me = {
        id: 'me',
        name: 'Алексей',
        mic: true,
        cam: true,
        speaking: false,
        pinned: true
      };

      const all = this.participantsOrder.map(id => this.participants[id]);

      return [me, ...all];
    },

    // Количество людей с учетом меня
    totalParticipants() {
      return this.participantsOrder.length + 1;
    },

    /*
      totalPages:
      - 1 страница зарезервирована под stage (топ-11)
      - остальные участники распихиваются по страницам по 11 человек
      - если людей <=11, то всего 1 страница и stage не используется
    */
    totalPages() {
      const PAGE_SIZE = 11;

      if (this.participantsOrder.length <= PAGE_SIZE) {
        return 1;
      }

      // сколько людей не в stage
      const offStageCount = this.participantsOrder.length - this.stage.length;

      // страница 1 = stage
      // + ceil(offStage / PAGE_SIZE) страниц для остальных
      return 1 + Math.ceil(offStageCount / PAGE_SIZE);
    },

    hasNextPage() {
      return this.currentPage < this.totalPages;
    },

    hasPrevPage() {
      return this.currentPage > 1;
    }
  },

  created() {
    /*
      updateStageThrottled:
      - это обертка над updateStageImmediate с throttle(100мс)
      - смысл: updateStageImmediate (дорогая сортировка всех участников)
        не должна исполняться слишком часто при хаосе (мьюты, камеры, входы/выходы).
      - leading: true → первый вызов срабатывает сразу
      - trailing: true → последний подвисший вызов все равно выполнится
        (то есть мы не теряем апдейт).
    */
    this.updateStageThrottled = throttle(this.updateStageImmediate, 100, {
      leading: true,
      trailing: true
    });
  },

  // mounted() {
  //   const mediaStore = useMediaStore()
  //   mediaStore.initMyCamera()
  // },

  beforeUnmount() {
    /*
      Убираем все побочные эффекты, чтобы не было утечек памяти:
      - останавливаем симулятор (clearInterval)
      - отменяем отложенные вызовы updateStageThrottled
      - чистим все таймеры gracePeriodTimers
    */
    this.stopSimulation();

    if (this.updateStageThrottled) {
      this.updateStageThrottled.cancel();
    }

    // Чистим все grace-таймеры (setTimeout на 2 секунды)
    for (const id in this.gracePeriodTimers) {
      clearTimeout(this.gracePeriodTimers[id]);
    }
    this.gracePeriodTimers = {};
  },

  methods: {
    /*
      addParticipant():
      - создает нового участника со случайным именем
      - решает, куда его вставить в participantsOrder:
        если с камерой → вставляется после последнего участника с камерой
        если без камеры → в конец
      - participantsOrder = "глобальный линейный список по порядку присутствия"
      - потом дергаем updateStage() (throttled), чтобы пересобрать сцену
    */
    addParticipant() {
      const firstName = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
      const lastName = this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
      const name = `${firstName} ${lastName}`;

      const id = `user_${this.nextJoinOrder}`;
      const hasCam = Math.random() > 0.5;

      this.participants[id] = {
        id,
        name,
        mic: false,
        cam: hasCam,
        speaking: false,
        pinned: false
      };

      if (hasCam) {
        // Ищем позицию "после последнего участника с камерой"
        // Это поддерживает инвариант:
        //   участники с камерой идут раньше участников без камеры
        let lastCamIndex = -1;
        for (let i = this.participantsOrder.length - 1; i >= 0; i--) {
          if (this.participants[this.participantsOrder[i]].cam) {
            lastCamIndex = i;
            break;
          }
        }
        this.participantsOrder.splice(lastCamIndex + 1, 0, id);
      } else {
        // Без камеры → просто в хвост
        this.participantsOrder.push(id);
      }

      this.nextJoinOrder++;
      this.updateStage();
    },

    /*
      removeParticipant(id):
      - удаляет участника полностью (из участников, из порядка, из сцены)
      - чистит ему возможный gracePeriod таймер
      - и пересобирает stage
      - защищено от попыток удалить "меня"
    */
    removeParticipant(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      // Удаляем из общего списка
      const orderIndex = this.participantsOrder.indexOf(id);
      if (orderIndex > -1) {
        this.participantsOrder.splice(orderIndex, 1);
      }

      // Удаляем со сцены если был
      const stageIndex = this.stage.indexOf(id);
      if (stageIndex > -1) {
        this.stage.splice(stageIndex, 1);
      }

      // Грейс-таймер, если был, убиваем
      if (this.gracePeriodTimers[id]) {
        clearTimeout(this.gracePeriodTimers[id]);
        delete this.gracePeriodTimers[id];
      }

      // Удаляем сам объект участника
      delete this.participants[id];

      // После удаления кого-то сильного/слабого состав stage мог поменяться
      this.updateStage();
    },

    /*
      toggleMic(id):
      - переключает микрофон участнику
      - сценарий А: мик включился у человека вне stage → пытаемся протолкнуть его на stage
      - сценарий Б: мик выключился у человека НА stage → запускаем grace period 2с
        (он временно "защищен", мы не выталкиваем его сразу,
         выкидываем его только если реально есть кто-то сильнее offStage)
    */
    toggleMic(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const participant = this.participants[id];
      participant.mic = !participant.mic;
    },

    toggleSpeaking(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const participant = this.participants[id];
      const wasOnStage = this.stage.includes(id);

      participant.speaking = !participant.speaking;

      const PAGE_SIZE = 11;
      if (this.participantsOrder.length <= PAGE_SIZE) return;

      if (participant.speaking && !wasOnStage) {
        if (this.gracePeriodTimers[id]) {
          clearTimeout(this.gracePeriodTimers[id]);
          delete this.gracePeriodTimers[id];
        }

        this.tryAddToStage(id);
      } else if (!participant.speaking && wasOnStage) {
        if (this.gracePeriodTimers[id]) {
          clearTimeout(this.gracePeriodTimers[id]);
          delete this.gracePeriodTimers[id];
        }

        this.gracePeriodTimers[id] = setTimeout(() => {
          const myPriority = this.getPriority(id);

          const offStage = this.participantsOrder.filter(otherId => !this.stage.includes(otherId));

          const strongerExists = offStage.some(otherId => {
            return this.getPriority(otherId) > myPriority;
          });

          if (strongerExists) {
            this.updateStage();
          }

          delete this.gracePeriodTimers[id];
        }, 2000);
      }
    },

    /*
      tryAddToStage(id):
      - попытка вставить участника в stage (топ-11). stage максимум 11.
      - если есть свободное место → ставим с гарантией "сначала камеры, потом без камер"
      - если места нет → сравниваем приоритеты:
        - если он сильнее самого слабого на сцене → выталкиваем слабого и ставим этого
        - иначе ничего не делаем
      - важное: работает только внутри stage (до 11 элементов), поэтому это дёшево.
    */
    tryAddToStage(id) {
      // не добавляем повторно
      if (this.stage.includes(id)) return;

      const PAGE_SIZE = 11;
      const participant = this.participants[id];

      // Если на сцене меньше 11 людей — просто вставляем с учетом камеры
      if (this.stage.length < PAGE_SIZE) {
        if (participant.cam) {
          // вставляем после последнего участника с камерой
          let lastCamIndex = -1;
          for (let i = this.stage.length - 1; i >= 0; i--) {
            if (this.participants[this.stage[i]].cam) {
              lastCamIndex = i;
              break;
            }
          }
          this.stage.splice(lastCamIndex + 1, 0, id);
        } else {
          // без камеры → перед первым без камеры
          let firstNoCamIndex = this.stage.length;
          for (let i = 0; i < this.stage.length; i++) {
            if (!this.participants[this.stage[i]].cam) {
              firstNoCamIndex = i;
              break;
            }
          }
          this.stage.splice(firstNoCamIndex, 0, id);
        }
        return;
      }

      // Если stage уже полон (11 человек):
      // ищем самого слабого по приоритету
      const newPriority = this.getPriority(id);

      let weakestIndex = -1;
      let weakestPriority = 5; // заведомо >4

      for (let i = this.stage.length - 1; i >= 0; i--) {
        const priority = this.getPriority(this.stage[i]);
        if (priority < weakestPriority) {
          weakestPriority = priority;
          weakestIndex = i;
        }
      }

      // Если мы сильнее слабейшего на сцене → вытесняем его
      if (newPriority > weakestPriority) {
        this.stage.splice(weakestIndex, 1);

        // и вставляем на правильное место (камеры впереди)
        if (participant.cam) {
          let lastCamIndex = -1;
          for (let i = this.stage.length - 1; i >= 0; i--) {
            if (this.participants[this.stage[i]].cam) {
              lastCamIndex = i;
              break;
            }
          }
          this.stage.splice(lastCamIndex + 1, 0, id);
        } else {
          let firstNoCamIndex = this.stage.length;
          for (let i = 0; i < this.stage.length; i++) {
            if (!this.participants[this.stage[i]].cam) {
              firstNoCamIndex = i;
              break;
            }
          }
          this.stage.splice(firstNoCamIndex, 0, id);
        }
      }
    },

      /*
        getPriority(id):
        приоритет участника для ранжирования в сцене:
          4 = speaking && cam
          3 = speaking && !cam
          2 = !speaking && cam
          1 = !speaking && !cam
        защита: если участник внезапно удалён во время рассчёта → вернуть 0
      */
    getPriority(id) {
      const p = this.participants[id];
      if (!p) return 0;  // защита от несуществующего id (участник уже мог быть удалён)
      if (p.speaking && p.cam) return 4;
      if (p.speaking && !p.cam) return 3;
      if (!p.speaking && p.cam) return 2;
      return 1;
    },

    /*
      toggleCam(id):
      - включает/выключает камеру участнику
      - держит инвариант:
        1) участники с камерой должны идти раньше без камеры и в participantsOrder, и в stage
        2) если человек был на stage и теряет камеру → пытаемся подобрать replacement с камерой
      - после этого часто вызываем updateStage(), чтобы стабилизировать сцену
    */
    toggleCam(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const participant = this.participants[id];
      const isOnStage = this.stage.includes(id);

      // Снимаем grace-таймер если есть
      if (!participant.cam && this.gracePeriodTimers[id]) {
        clearTimeout(this.gracePeriodTimers[id]);
        delete this.gracePeriodTimers[id];
      }

      // ============ ВЫКЛЮЧЕНИЕ КАМЕРЫ ============
      if (participant.cam) {
        participant.cam = false;

        if (isOnStage) {
          // ✅ НЕ УДАЛЯЕМ из stage! updateStageImmediate сам решит!

          // Перемещаем в блок "без камер" в participantsOrder
          const orderIndex = this.participantsOrder.indexOf(id);
          if (orderIndex > -1) {
            this.participantsOrder.splice(orderIndex, 1);
          }

          const firstNoCamIndex = this.participantsOrder.findIndex(otherId => {
            return !this.participants[otherId].cam;
          });

          if (firstNoCamIndex !== -1) {
            this.participantsOrder.splice(firstNoCamIndex, 0, id);
          } else {
            this.participantsOrder.push(id);
          }

          // ✅ Просто вызываем updateStage - он пересоберёт stage правильно
          this.updateStage();

        } else {
          // Выключил камеру ВНЕ STAGE
          const orderIndex = this.participantsOrder.indexOf(id);
          if (orderIndex > -1) {
            this.participantsOrder.splice(orderIndex, 1);
          }

          const firstNoCamIndex = this.participantsOrder.findIndex(otherId => {
            return !this.participants[otherId].cam;
          });

          if (firstNoCamIndex !== -1) {
            this.participantsOrder.splice(firstNoCamIndex, 0, id);
          } else {
            this.participantsOrder.push(id);
          }
        }
      }
      // ============ ВКЛЮЧЕНИЕ КАМЕРЫ ============
      else {
        participant.cam = true;

        if (isOnStage) {
          // Включил камеру В STAGE - переставляем в зону камер
          const currentIndex = this.stage.indexOf(id);
          if (currentIndex > -1) {
            this.stage.splice(currentIndex, 1);
          }

          let lastCamInStage = -1;
          for (let i = this.stage.length - 1; i >= 0; i--) {
            if (this.participants[this.stage[i]].cam) {
              lastCamInStage = i;
              break;
            }
          }
          this.stage.splice(lastCamInStage + 1, 0, id);

          // Перемещаем в зону камер в participantsOrder
          const orderIndex = this.participantsOrder.indexOf(id);
          if (orderIndex > -1) {
            this.participantsOrder.splice(orderIndex, 1);
          }

          let lastCamIndex = -1;
          for (let i = this.participantsOrder.length - 1; i >= 0; i--) {
            if (this.participants[this.participantsOrder[i]].cam) {
              lastCamIndex = i;
              break;
            }
          }
          this.participantsOrder.splice(lastCamIndex + 1, 0, id);

        } else {
          // Включил камеру ВНЕ STAGE
          // Перемещаем в зону камер в participantsOrder
          const orderIndex = this.participantsOrder.indexOf(id);
          if (orderIndex > -1) {
            this.participantsOrder.splice(orderIndex, 1);
          }

          let lastCamIndex = -1;
          for (let i = this.participantsOrder.length - 1; i >= 0; i--) {
            if (this.participants[this.participantsOrder[i]].cam) {
              lastCamIndex = i;
              break;
            }
          }
          this.participantsOrder.splice(lastCamIndex + 1, 0, id);

          // Пытаемся добавить на stage
          this.tryAddToStage(id);
        }
      }

      // Финальная проверка и обновление
      const nowOnStage = this.stage.includes(id);
      if (this.stage.length > 0 && !nowOnStage) {
        this.updateStage();
      }
    },

    /*
      updateStage():
      - обертка, которая дергает throttled версию
      - это значит, что реальные дорогие перерасчеты сцены
        не будут происходить слишком часто
    */
    updateStage() {
      this.updateStageThrottled();
    },

    /*
      updateStageImmediate():
      Это сердце алгоритма "кто на сцене и в каком порядке".

      Алгоритм делает 2 вещи:
      1. решает СОСТАВ stage (кто входит в топ-11, кого нужно заменить)
         → состояние "кто достоин оказаться в топ-11"
      2. решает ПОРЯДОК внутри stage (кто слева-направо)
         → стабильная раскладка, чтобы сетка не прыгала

      Важные правила:
      - stage максимум 11 человек
      - камеры всегда впереди без камер
      - те, кто уже был на сцене (survivors), должны максимально сохранять
        свой порядок и не прыгать из-за одного новичка
    */
    updateStageImmediate() {
      const PAGE_SIZE = 11;

      // берем только реально живых участников (могли кого-то удалить)
      const aliveOrder = this.participantsOrder.filter(id => !!this.participants[id]);

      // Если людей меньше или равно 11, то вообще не нужен stage:
      // первая страница просто покажет всех сразу.
      if (aliveOrder.length <= PAGE_SIZE) {
        this.stage = [];
        return;
      }

      // Текущая сцена, но только те id, которые ещё существуют
      const currentStageAlive = this.stage.filter(id => !!this.participants[id]);

      // 1. Кандидаты для потенциальной сцены:
      //    - все, кто уже был на сцене
      //    - плюс все остальные живые участники
      //
      //    Это гарантирует:
      //    - мы не теряем текущих ребят просто так
      //    - но и даём шанс новым сильным ворваться
      const uniqueCandidates = Array.from(new Set([...currentStageAlive, ...aliveOrder]));

      // 2. Сортируем кандидатов по приоритету (4 > 3 > 2 > 1)
      //    Это используется ТОЛЬКО чтобы решить, КТО попадает в топ-11 по силе,
      //    но не чтобы решить их визуальный порядок.
      const sortedByStrength = [...uniqueCandidates].sort((a, b) => {
        return this.getPriority(b) - this.getPriority(a);
      });

      // 3. Берем первые 11 по силе — это те, кто имеет право сидеть на сцене
      const top11 = sortedByStrength.slice(0, PAGE_SIZE);
      const top11Set = new Set(top11);

      // 4. Делим топ-11 на две группы:
      //    - survivors: те, кто уже был на сцене и всё ещё попадает в топ-11
      //    - newcomers: те, кто ворвался в топ-11 впервые
      //
      //    Важный UX момент:
      //    survivors должны оставаться впереди новичков при равных условиях,
      //    чтобы сцена не "прыгала" и не меняла порядок каждые полсекунды.
      const survivors = currentStageAlive.filter(id => top11Set.has(id));
      const newcomers = top11.filter(id => !survivors.includes(id));

      // 5. Собираем финальный порядок для отображения.
      //
      //    Правило камер:
      //    - сначала ВСЕ с камерой,
      //    - потом ВСЕ без камеры.
      //
      //    Правило стабильности:
      //    - внутри "камера" сперва survivors (в их старом порядке),
      //      потом newcomers
      //    - внутри "без камеры" та же логика
      const camSurvivors = survivors.filter(id => this.participants[id]?.cam);
      const camNew = newcomers.filter(id => this.participants[id]?.cam);
      const noCamSurvivors = survivors.filter(id => !this.participants[id]?.cam);
      const noCamNew = newcomers.filter(id => !this.participants[id]?.cam);

      // Итоговая сцена:
      // - камеры, кто уже был
      // - камеры, кто ворвался
      // - без камер, кто уже был
      // - без камер, кто ворвался
      //
      // Это значит:
      // - Новенький с камерой может попасть на сцену (вытеснить слабого),
      //   но не перепрыгнет всех моментально в слот #1.
      // - Участники на сцене не будут дергаться в каждом апдейте.
      this.stage = [
        ...camSurvivors,
        ...camNew,
        ...noCamSurvivors,
        ...noCamNew
      ];
    },

    // Пагинация (вправо/влево)
    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
      }
    },

    prevPage() {
      if (this.currentPage > 1) {
        this.currentPage--;
      }
    },

    /*
      Симуляция:
      - startSimulation() создает setInterval каждые 3с
      - performRandomActions() добавляет/удаляет/тогглит нескольких случайных людей
      - stopSimulation() чистит интервал
    */
    startSimulation() {
      if (this.isSimulationRunning) return;

      this.isSimulationRunning = true;

      this.simulationInterval = setInterval(() => {
        this.performRandomActions();
      }, 3000);
    },

    stopSimulation() {
      if (!this.isSimulationRunning) return;

      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      this.isSimulationRunning = false;
    },

    performRandomActions() {
      // Рандомно добавляем 1-5 участников
      const addCount = Math.floor(Math.random() * 5) + 1;
      for (let i = 0; i < addCount; i++) {
        this.addParticipant();
      }

      // Рандомно удаляем до 5 участников (если вообще есть участники)
      if (this.participantsOrder.length > 0) {
        const removeCount = Math.min(
          Math.floor(Math.random() * 5) + 1,
          this.participantsOrder.length
        );

        for (let i = 0; i < removeCount; i++) {
          const randomIndex = Math.floor(Math.random() * this.participantsOrder.length);
          const randomId = this.participantsOrder[randomIndex];
          this.removeParticipant(randomId);
        }
      }

      // Рандомно переключаем камеру у до 5 участников
      if (this.participantsOrder.length > 0) {
        const camCount = Math.min(
          Math.floor(Math.random() * 5) + 1,
          this.participantsOrder.length
        );

        for (let i = 0; i < camCount; i++) {
          const randomIndex = Math.floor(Math.random() * this.participantsOrder.length);
          const randomId = this.participantsOrder[randomIndex];
          this.toggleCam(randomId);
        }
      }

      // Рандомно переключаем микрофон у до 5 участников
      if (this.participantsOrder.length > 0) {
        const micCount = Math.min(
          Math.floor(Math.random() * 5) + 1,
          this.participantsOrder.length
        );

        for (let i = 0; i < micCount; i++) {
          const randomIndex = Math.floor(Math.random() * this.participantsOrder.length);
          const randomId = this.participantsOrder[randomIndex];
          this.toggleMic(randomId);
        }
      }

      // Рандомно переключаем состояние "говорит" у до 5 участников
      if (this.participantsOrder.length > 0) {
        const speakingCount = Math.min(
          Math.floor(Math.random() * 5) + 1,
          this.participantsOrder.length
        );

        for (let i = 0; i < speakingCount; i++) {
          const randomIndex = Math.floor(Math.random() * this.participantsOrder.length);
          const randomId = this.participantsOrder[randomIndex];
          this.toggleSpeaking(randomId);
        }
      }
    },

    toggleSimulation() {
      if (this.isSimulationRunning) {
        this.stopSimulation();
      } else {
        this.startSimulation();
      }
    }
  },

  watch: {
    /*
      Следим за totalPages.
      Если, например, мы были на странице 3, но половина людей вышла,
      и теперь всего 1 страница — мы не должны оставаться на "мертвом" экране.
      Здесь мы гарантируем, что currentPage не будет больше, чем totalPages.
    */
    totalPages(newVal) {
      if (this.currentPage > newVal && newVal > 0) {
        this.currentPage = newVal;
      }
    }
  },
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Общий layout: слева список, справа сцена/грид */
.wrapper {
  min-height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  display: flex;
  background: #1a1a1a;
  color: #fff;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Inter", Roboto, "Helvetica Neue", sans-serif;
}

/* Левая панель (участники списком, кнопки управления) */
.sidebar-left {
  display: flex;
  flex-direction: column;
  background: #2a2a2a;
  overflow-y: auto;
  min-width: 240px;
  max-width: 260px;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
}

/* Кнопка "Добавить участника" */
.add-btn {
  margin: 15px;
  padding: 10px 20px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  transition: all 0.15s ease;
}

.add-btn:hover {
  background: #45a049;
  box-shadow: 0 8px 24px rgba(76, 175, 80, 0.35);
}

/* Кнопка "Симуляция" (рандом движ) */
.simulation-btn {
  margin: 0 15px 15px;
  padding: 10px 20px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  transition: all 0.15s ease;
}

.simulation-btn:hover {
  background: #1976d2;
  box-shadow: 0 8px 24px rgba(33, 150, 243, 0.35);
}

.simulation-btn.active {
  background: #f44336;
  animation: pulse 1.5s infinite;
}

/* Немного внимания к активной кнопке (анимация пульса) */
@keyframes pulse {

  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7);
  }

  50% {
    box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
  }
}

/* Правая зона, где показываются видео-тайлы */
.grid-area {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
  justify-content: center;
  background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.06) 0%, rgba(0, 0, 0, 0) 60%);
}

/* Кнопки навигации влево/вправо (переключение страниц) */
.nav-btn {
  position: absolute;
  width: 50px;
  height: 50px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.2s;
  user-select: none;
}

.nav-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  border-color: rgba(255, 255, 255, 0.5);
  transform: scale(1.1);
}

.nav-prev {
  left: 20px;
}

.nav-next {
  right: 20px;
}

/* Плашка с информацией о текущей странице */
.page-indicator {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  line-height: 1.2;
  z-index: 10;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
}
</style>
