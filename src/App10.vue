<!-- Что-то более менее работчее, кроме бага с тем что без задержуи при включении камеры вылетает (считаю не критичным) -->
<template>
  <div class="wrapper">
    <div class="sidebar-left">
      <button @click="addParticipant" class="add-btn">+ Добавить</button>

      <button @click="toggleSimulation" :class="['simulation-btn', { active: isSimulationRunning }]">
        {{ isSimulationRunning ? '⏹️ Остановить' : '▶️ Симуляция' }}
      </button>

      <ParticipantsList :participants="allParticipantsForList" @toggle-mic="toggleMic" @toggle-cam="toggleCam"
        @remove-participant="removeParticipant" />
    </div>

    <div class="grid-area">
      <button v-if="hasPrevPage" @click="prevPage" class="nav-btn nav-prev">
        ←
      </button>

      <Grid :participants="sortedParticipants" @toggle-mic="toggleMic" @toggle-cam="toggleCam"
        @remove-participant="removeParticipant" />

      <button v-if="hasNextPage" @click="nextPage" class="nav-btn nav-next">
        →
      </button>

      <div class="page-indicator">
        Страница {{ currentPage }} из {{ totalPages }}
      </div>
    </div>
  </div>
</template>

<script>
import Grid from './Grid.vue';
import ParticipantsList from './ParticipantsList.vue';
import { useMediaStore } from './stores/media';
import { throttle } from 'lodash-es';

export default {
  components: {
    Grid,
    ParticipantsList
  },


  data() {
    return {
      currentPage: 1,
      participants: {},
      participantsOrder: [],
      stage: [],
      gracePeriodTimers: {},
      nextJoinOrder: 1,
      isSimulationRunning: false,
      simulationInterval: null,

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
    sortedParticipants() {
      const me = { id: 'me', name: 'Алексей', mic: true, cam: true };
      const PAGE_SIZE = 11;

      if (this.participantsOrder.length <= PAGE_SIZE) {
        const all = this.participantsOrder.map(id => this.participants[id]);
        return [me, ...all];
      }

      if (this.currentPage === 1) {
        const onStage = this.stage.map(id => this.participants[id]);
        return [me, ...onStage];
      }

      const offStage = this.participantsOrder.filter(id => !this.stage.includes(id));
      const startIndex = (this.currentPage - 2) * PAGE_SIZE;
      const endIndex = startIndex + PAGE_SIZE;
      const pageIds = offStage.slice(startIndex, endIndex);
      const pageParticipants = pageIds.map(id => this.participants[id]);

      return [me, ...pageParticipants];
    },

    allParticipantsForList() {
      const me = {
        id: 'me',
        name: 'Алексей',
        mic: true,
        cam: true,
        pinned: true
      };

      const all = this.participantsOrder.map(id => this.participants[id]);

      return [me, ...all];
    },

    totalParticipants() {
      return this.participantsOrder.length + 1;
    },

    totalPages() {
      const PAGE_SIZE = 11;

      if (this.participantsOrder.length <= PAGE_SIZE) {
        return 1;
      }

      const offStageCount = this.participantsOrder.length - this.stage.length;
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
    this.stopSimulation();

    if (this.updateStageThrottled) {
      this.updateStageThrottled.cancel();
    }

    // Чистим все grace-таймеры
    for (const id in this.gracePeriodTimers) {
      clearTimeout(this.gracePeriodTimers[id]);
    }
    this.gracePeriodTimers = {};
  },

  methods: {
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
        pinned: false
      };

      if (hasCam) {
        let lastCamIndex = -1;
        for (let i = this.participantsOrder.length - 1; i >= 0; i--) {
          if (this.participants[this.participantsOrder[i]].cam) {
            lastCamIndex = i;
            break;
          }
        }
        this.participantsOrder.splice(lastCamIndex + 1, 0, id);
      } else {
        this.participantsOrder.push(id);
      }

      this.nextJoinOrder++;
      this.updateStage();
    },

    removeParticipant(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const orderIndex = this.participantsOrder.indexOf(id);
      if (orderIndex > -1) {
        this.participantsOrder.splice(orderIndex, 1);
      }

      const stageIndex = this.stage.indexOf(id);
      if (stageIndex > -1) {
        this.stage.splice(stageIndex, 1);
      }

      if (this.gracePeriodTimers[id]) {
        clearTimeout(this.gracePeriodTimers[id]);
        delete this.gracePeriodTimers[id];
      }

      delete this.participants[id];
      this.updateStage();
    },

    toggleMic(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const participant = this.participants[id];
      const wasOnStage = this.stage.includes(id);

      participant.mic = !participant.mic;

      const PAGE_SIZE = 11;
      if (this.participantsOrder.length <= PAGE_SIZE) return;

      if (participant.mic && !wasOnStage) {
        if (this.gracePeriodTimers[id]) {
          clearTimeout(this.gracePeriodTimers[id]);
          delete this.gracePeriodTimers[id];
        }

        this.tryAddToStage(id);
      } else if (!participant.mic && wasOnStage) {
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

    tryAddToStage(id) {
      // ✅ ДОБАВЛЕНО: Защита от дублей
      if (this.stage.includes(id)) return;

      const PAGE_SIZE = 11;
      const participant = this.participants[id];

      if (this.stage.length < PAGE_SIZE) {
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
        return;
      }

      const newPriority = this.getPriority(id);

      let weakestIndex = -1;
      let weakestPriority = 5;

      for (let i = this.stage.length - 1; i >= 0; i--) {
        const priority = this.getPriority(this.stage[i]);
        if (priority < weakestPriority) {
          weakestPriority = priority;
          weakestIndex = i;
        }
      }

      if (newPriority > weakestPriority) {
        this.stage.splice(weakestIndex, 1);

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

    getPriority(id) {
      const p = this.participants[id];
      if (!p) return 0;  // ✅ ДОБАВИЛИ: Защита от undefined
      if (p.mic && p.cam) return 4;
      if (p.mic && !p.cam) return 3;
      if (!p.mic && p.cam) return 2;
      return 1;
    },

    toggleCam(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const participant = this.participants[id];
      const isOnStage = this.stage.includes(id);

      if (!participant.cam && this.gracePeriodTimers[id]) {
        clearTimeout(this.gracePeriodTimers[id]);
        delete this.gracePeriodTimers[id];
      }

      // ============ ВЫКЛЮЧЕНИЕ КАМЕРЫ ============
      if (participant.cam) {
        participant.cam = false;

        if (isOnStage) {
          // Выключил камеру В STAGE
          const stageIndex = this.stage.indexOf(id);
          if (stageIndex > -1) {
            this.stage.splice(stageIndex, 1);
          }

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

          const replacement = this.participantsOrder.find(otherId => {
            return this.participants[otherId].cam && !this.stage.includes(otherId);
          });

          if (replacement) {
            this.stage.push(replacement);
          }

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
          // ✅ ИСПРАВЛЕНО: Включил камеру ВНЕ STAGE
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

          // ✅ КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Используем tryAddToStage
          // Он проверит приоритеты и вытеснит только если мы сильнее!
          this.tryAddToStage(id);
        }
      }

      // Финальная проверка и обновление
      const nowOnStage = this.stage.includes(id);
      if (this.stage.length > 0 && !nowOnStage) {
        this.updateStage();
      }
    },

    updateStage() {
      this.updateStageThrottled();
    },

    updateStageImmediate() {
      const PAGE_SIZE = 11;

      // ✅ ДОБАВИЛИ: Фильтруем только живые ID
      const aliveOrder = this.participantsOrder.filter(id => !!this.participants[id]);

      // Меняем проверку с this.participantsOrder.length на aliveOrder.length
      if (aliveOrder.length <= PAGE_SIZE) {
        this.stage = [];
        return;
      }

      // Сортируем aliveOrder вместо participantsOrder
      const allByPriority = [...aliveOrder].sort((a, b) => {
        return this.getPriority(b) - this.getPriority(a);
      });

      const top11 = allByPriority.slice(0, PAGE_SIZE);

      const withCam = [];
      const withoutCam = [];

      for (const id of top11) {
        // ✅ ДОБАВИЛИ: Optional chaining ?.
        if (this.participants[id]?.cam) {
          withCam.push(id);
        } else {
          withoutCam.push(id);
        }
      }

      this.stage = [...withCam, ...withoutCam];
    },

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
      const addCount = Math.floor(Math.random() * 5) + 1;
      for (let i = 0; i < addCount; i++) {
        this.addParticipant();
      }

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

.wrapper {
  min-height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  display: flex;
  background: #1a1a1a;
  color: #fff;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Inter", Roboto, "Helvetica Neue", sans-serif;
}

.sidebar-left {
  display: flex;
  flex-direction: column;
  background: #2a2a2a;
  overflow-y: auto;
  min-width: 240px;
  max-width: 260px;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
}

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

@keyframes pulse {

  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7);
  }

  50% {
    box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
  }
}

.grid-area {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
  justify-content: center;
  background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.06) 0%, rgba(0, 0, 0, 0) 60%);
}

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
