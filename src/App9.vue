<!-- Финальны c задержкой и комментариями -->
<template>
    <div class="wrapper">
        <!-- Левый сайдбар со списком всех участников -->
        <div class="sidebar-left">
            <!-- Кнопка добавления нового участника -->
            <button @click="addParticipant" class="add-btn">+ Добавить</button>

            <!-- Компонент списка участников -->
            <ParticipantsList :participants="allParticipantsForList" @toggle-mic="toggleMic" @toggle-cam="toggleCam"
                @remove-participant="removeParticipant" />
        </div>

        <!-- Основная область с сеткой участников -->
        <div class="grid-area">
            <!-- Кнопка навигации "назад" (показывается если не первая страница) -->
            <button v-if="hasPrevPage" @click="prevPage" class="nav-btn nav-prev">
                ←
            </button>

            <!-- Сетка видео участников для текущей страницы -->
            <Grid :participants="sortedParticipants" @toggle-mic="toggleMic" @toggle-cam="toggleCam"
                @remove-participant="removeParticipant" />

            <!-- Кнопка навигации "вперед" (показывается если есть следующая страница) -->
            <button v-if="hasNextPage" @click="nextPage" class="nav-btn nav-next">
                →
            </button>

            <!-- Индикатор текущей страницы -->
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

export default {
    components: {
        Grid,
        ParticipantsList
    },

    data() {
        return {
            // Текущая активная страница пагинации (1, 2, 3...)
            currentPage: 1,

            // Словарь всех участников: { id: { name, mic, cam, pinned } }
            // Хранит ВСЕ данные о каждом участнике
            participants: {},

            // Массив ID участников в порядке отображения
            // Структура: [камеры..., без_камер...]
            // Определяет порядок в сайдбаре и базу для stage
            participantsOrder: [],

            // Топ-11 участников для главной страницы (когда >11 человек)
            // Пустой массив если ≤11 участников
            stage: [],

            // Таймеры grace period (задержка 2 сек перед вытеснением)
            // { id: timeoutId }
            gracePeriodTimers: {},

            // Счетчик для генерации уникальных ID участников
            nextJoinOrder: 1,

            // Массивы имен для генерации случайных участников
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
        /**
         * Возвращает массив участников для отображения на текущей странице
         * Всегда включает "меня" (Алексей) первым элементом
         * 
         * Логика:
         * - Если ≤11 участников: я + все остальные (пагинация не нужна)
         * - Если страница 1: я + топ-11 из stage
         * - Если страница 2+: я + участники вне stage (пагинация по 11)
         */
        sortedParticipants() {
            // Я всегда первый на любой странице
            const me = { id: 'me', name: 'Алексей', mic: true, cam: true };
            const PAGE_SIZE = 11;

            // Случай 1: Мало участников (≤11) - пагинация не нужна
            if (this.participantsOrder.length <= PAGE_SIZE) {
                const all = this.participantsOrder.map(id => this.participants[id]);
                return [me, ...all];
            }

            // Случай 2: Первая страница - показываем stage (топ-11 по приоритету)
            if (this.currentPage === 1) {
                const onStage = this.stage.map(id => this.participants[id]);
                return [me, ...onStage];
            }

            // Случай 3: Страницы 2, 3, 4... - показываем тех кто НЕ в stage
            const offStage = this.participantsOrder.filter(id => !this.stage.includes(id));

            // Вычисляем индексы для текущей страницы
            // Страница 2: startIndex = 0, endIndex = 11
            // Страница 3: startIndex = 11, endIndex = 22
            const startIndex = (this.currentPage - 2) * PAGE_SIZE;
            const endIndex = startIndex + PAGE_SIZE;
            const pageIds = offStage.slice(startIndex, endIndex);
            const pageParticipants = pageIds.map(id => this.participants[id]);

            return [me, ...pageParticipants];
        },

        /**
         * Возвращает всех участников для сайдбара (список слева)
         * Я всегда первый и закреплен (pinned: true)
         */
        allParticipantsForList() {
            const me = {
                id: 'me',
                name: 'Алексей',
                mic: true,
                cam: true,
                pinned: true  // Закреплен в списке
            };

            const all = this.participantsOrder.map(id => this.participants[id]);
            return [me, ...all];
        },

        /**
         * Общее количество участников (включая меня)
         */
        totalParticipants() {
            return this.participantsOrder.length + 1;
        },

        /**
         * Вычисляет общее количество страниц
         * 
         * Формула:
         * - Если ≤11 участников: 1 страница
         * - Если >11: 1 страница (stage) + ceil(offStage / 11)
         * 
         * Пример: 17 участников
         * offStage = 17 - 11 = 6
         * totalPages = 1 + ceil(6/11) = 2
         */
        totalPages() {
            const PAGE_SIZE = 11;

            if (this.participantsOrder.length <= PAGE_SIZE) {
                return 1;
            }

            const offStageCount = this.participantsOrder.length - this.stage.length;
            return 1 + Math.ceil(offStageCount / PAGE_SIZE);
        },

        /**
         * Есть ли следующая страница?
         */
        hasNextPage() {
            return this.currentPage < this.totalPages;
        },

        /**
         * Есть ли предыдущая страница?
         */
        hasPrevPage() {
            return this.currentPage > 1;
        }
    },

    mounted() {
        // Инициализация своей камеры при загрузке компонента
        const mediaStore = useMediaStore()
        mediaStore.initMyCamera()
    },

    methods: {
        /**
         * Добавляет нового участника со случайным именем
         * 
         * Алгоритм:
         * 1. Генерируем случайное имя
         * 2. Создаем объект участника
         * 3. Вставляем в participantsOrder по группам:
         *    - С камерой → после последнего с камерой
         *    - Без камеры → в конец массива
         * 4. Вызываем updateStage() для пересчета топ-11
         * 
         * Визуализация вставки:
         * Было: [cam1, cam2, cam3, no_cam1, no_cam2]
         * 
         * Добавили cam4:
         * [cam1, cam2, cam3, cam4, no_cam1, no_cam2]
         *                    ↑ вставили после последней камеры
         * 
         * Добавили no_cam3:
         * [cam1, cam2, cam3, cam4, no_cam1, no_cam2, no_cam3]
         *                                              ↑ в конец
         */
        addParticipant() {
            const firstName = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
            const lastName = this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
            const name = `${firstName} ${lastName}`;

            const id = `user_${this.nextJoinOrder}`;
            const hasCam = Math.random() > 0.5;  // 50/50 шанс камеры

            this.participants[id] = {
                id,
                name,
                mic: false,      // Новые участники изначально молчат
                cam: hasCam,
                pinned: false
            };

            // Вставка в participantsOrder по группам
            if (hasCam) {
                // С камерой → ищем последнего с камерой и вставляем после него
                let lastCamIndex = -1;
                for (let i = this.participantsOrder.length - 1; i >= 0; i--) {
                    if (this.participants[this.participantsOrder[i]].cam) {
                        lastCamIndex = i;
                        break;
                    }
                }
                this.participantsOrder.splice(lastCamIndex + 1, 0, id);
            } else {
                // Без камеры → просто добавляем в конец
                this.participantsOrder.push(id);
            }

            this.nextJoinOrder++;
            this.updateStage();  // Пересчитываем топ-11
        },

        /**
         * Удаляет участника из системы
         * 
         * Алгоритм:
         * 1. Проверка на "меня" и существование
         * 2. Удаление из participantsOrder
         * 3. Удаление из stage
         * 4. Очистка таймера grace period (если был)
         * 5. Удаление из participants
         * 6. Пересчет stage
         */
        removeParticipant(id) {
            if (id === 'me') return;  // Себя нельзя удалить
            if (!this.participants[id]) return;

            // Удаляем из participantsOrder
            const orderIndex = this.participantsOrder.indexOf(id);
            if (orderIndex > -1) {
                this.participantsOrder.splice(orderIndex, 1);
            }

            // Удаляем из stage
            const stageIndex = this.stage.indexOf(id);
            if (stageIndex > -1) {
                this.stage.splice(stageIndex, 1);
            }

            // Очищаем таймер если был запущен
            if (this.gracePeriodTimers[id]) {
                clearTimeout(this.gracePeriodTimers[id]);
                delete this.gracePeriodTimers[id];
            }

            // Удаляем самого участника
            delete this.participants[id];

            this.updateStage();  // Может освободилось место в stage
        },

        /**
         * Переключает состояние микрофона участника
         * 
         * Приоритеты:
         * 4 = Говорит + Камера
         * 3 = Говорит без камеры
         * 2 = Молчит + Камера
         * 1 = Молчит без камеры
         * 
         * Сценарии:
         * 
         * 1. ВКЛЮЧЕНИЕ MIC ВНЕ STAGE:
         *    user_X (вне stage) включает mic → приоритет ↑
         *    → tryAddToStage(user_X) - попытка попасть в stage
         * 
         * 2. ВЫКЛЮЧЕНИЕ MIC В STAGE (grace period):
         *    user_X (в stage) выключает mic → приоритет ↓
         *    → Запуск таймера на 2 секунды
         *    → Через 2 сек: проверка есть ли offStage сильнее?
         *       - Да → updateStage() (вытеснение)
         *       - Нет → остается на месте
         * 
         * Визуализация grace period:
         * 
         * t=0:  user_X говорит (приоритет 3) в stage
         * t=0:  user_X выключает mic → приоритет падает до 1
         * t=0:  Запуск таймера... ⏱️
         * t=0-2: user_X висит на экране (grace period)
         * t=1:  user_X включает камеру? → таймер отменен! ✅ остается
         * t=2:  Таймер сработал → проверка → вытеснение если нужно
         */
        toggleMic(id) {
            if (id === 'me') return;
            if (!this.participants[id]) return;

            const participant = this.participants[id];
            const wasOnStage = this.stage.includes(id);

            participant.mic = !participant.mic;  // Переключаем состояние

            // Если stage не активен (≤11 человек), ничего не делаем
            if (this.stage.length === 0) return;

            // СЦЕНАРИЙ 1: Включил mic ВНЕ stage
            if (participant.mic && !wasOnStage) {
                // Отменяем старый таймер если был (может снова заговорил)
                if (this.gracePeriodTimers[id]) {
                    clearTimeout(this.gracePeriodTimers[id]);
                    delete this.gracePeriodTimers[id];
                }

                // Пытаемся попасть в stage (вытесняя слабого если нужно)
                this.tryAddToStage(id);
            }
            // СЦЕНАРИЙ 2: Выключил mic В stage
            else if (!participant.mic && wasOnStage) {
                // Отменяем предыдущий таймер если был
                if (this.gracePeriodTimers[id]) {
                    clearTimeout(this.gracePeriodTimers[id]);
                    delete this.gracePeriodTimers[id];
                }

                // Запускаем grace period на 2 секунды
                // За эти 2 секунды участник может включить камеру и остаться
                this.gracePeriodTimers[id] = setTimeout(() => {
                    // Через 2 секунды проверяем нужно ли вытеснять
                    const myPriority = this.getPriority(id);
                    const offStage = this.participantsOrder.filter(otherId => !this.stage.includes(otherId));

                    // Есть ли вне stage кто-то с приоритетом выше?
                    const strongerExists = offStage.some(otherId => {
                        return this.getPriority(otherId) > myPriority;
                    });

                    if (strongerExists) {
                        this.updateStage();  // Да → пересчитываем stage (меня вытеснят)
                    }
                    // Нет → остаюсь на месте

                    // Очищаем таймер из объекта
                    delete this.gracePeriodTimers[id];
                }, 2000);
            }
        },

        /**
         * Пытается добавить участника в stage
         * Вызывается когда участник включает mic находясь вне stage
         * 
         * Алгоритм:
         * 
         * СЛУЧАЙ 1: Stage не полон (< 11 человек)
         *   → Вставляем по группам без проверки приоритета
         *   - С камерой → в конец зоны камер
         *   - Без камеры → в начало зоны без камер
         * 
         * СЛУЧАЙ 2: Stage полон (= 11 человек)
         *   1. Находим самого слабого в stage
         *   2. Сравниваем: мой приоритет > слабого?
         *   3. Да → вытесняем слабого, вставляем себя по группам
         *   4. Нет → не попадаем
         * 
         * Визуализация:
         * Stage (полон): [cam1(2), cam2(2), cam3(4), no_cam1(1), no_cam2(1)]
         * 
         * user_X включает mic (приоритет 3, без камеры):
         * 
         * 1. Ищем слабого: no_cam2 (приоритет 1)
         * 2. 3 > 1 ✓ → вытесняем no_cam2
         * 3. Stage: [cam1(2), cam2(2), cam3(4), no_cam1(1)]
         * 4. Вставляем user_X в начало зоны без камер:
         * 
         * Результат: [cam1(2), cam2(2), cam3(4), user_X(3), no_cam1(1)]
         *                                          ↑ говорящий приоритетнее молчащего
         */
        tryAddToStage(id) {
            const PAGE_SIZE = 11;
            const participant = this.participants[id];

            // СЛУЧАЙ 1: Stage не полон - просто вставляем по группам
            if (this.stage.length < PAGE_SIZE) {
                if (participant.cam) {
                    // С камерой → ищем последнего с камерой в stage
                    let lastCamIndex = -1;
                    for (let i = this.stage.length - 1; i >= 0; i--) {
                        if (this.participants[this.stage[i]].cam) {
                            lastCamIndex = i;
                            break;
                        }
                    }
                    this.stage.splice(lastCamIndex + 1, 0, id);
                } else {
                    // Без камеры → ищем первого без камеры в stage
                    let firstNoCamIndex = this.stage.length;  // По умолчанию в конец
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

            // СЛУЧАЙ 2: Stage полон - нужно вытеснить слабого
            const newPriority = this.getPriority(id);

            // Ищем самого слабого в stage (минимальный приоритет)
            let weakestIndex = -1;
            let weakestPriority = 5;  // Больше максимального приоритета

            for (let i = this.stage.length - 1; i >= 0; i--) {
                const priority = this.getPriority(this.stage[i]);
                if (priority < weakestPriority) {
                    weakestPriority = priority;
                    weakestIndex = i;
                }
            }

            // Проверяем: я сильнее самого слабого?
            if (newPriority > weakestPriority) {
                // Да → вытесняем слабого
                this.stage.splice(weakestIndex, 1);

                // Вставляем себя по группам
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
            // Нет → не попадаем в stage
        },

        /**
         * Возвращает приоритет участника
         * 
         * Таблица приоритетов:
         * ┌─────────┬────────┬──────────────┐
         * │ mic     │ cam    │ Приоритет    │
         * ├─────────┼────────┼──────────────┤
         * │ true    │ true   │ 4 (высший)   │
         * │ true    │ false  │ 3            │
         * │ false   │ true   │ 2            │
         * │ false   │ false  │ 1 (низший)   │
         * └─────────┴────────┴──────────────┘
         */
        getPriority(id) {
            const p = this.participants[id];
            if (p.mic && p.cam) return 4;   // Говорит + камера
            if (p.mic && !p.cam) return 3;  // Говорит без камеры
            if (!p.mic && p.cam) return 2;  // Молчит + камера
            return 1;                        // Молчит без камеры
        },

        /**
         * Переключает состояние камеры участника
         * 
         * КРИТИЧНО: При включении камеры отменяет grace period!
         * Это позволяет "спасти" временного участника от вытеснения.
         * 
         * Основные сценарии:
         * 
         * 1. ВЫКЛЮЧЕНИЕ КАМЕРЫ В STAGE:
         *    - Удаляем из stage
         *    - Перемещаем в зону БЕЗ камер в participantsOrder
         *    - Ищем замену (первый с камерой вне stage)
         *    - Пересчитываем stage
         * 
         * 2. ВЫКЛЮЧЕНИЕ КАМЕРЫ ВНЕ STAGE:
         *    - Просто перемещаем в зону БЕЗ камер в participantsOrder
         * 
         * 3. ВКЛЮЧЕНИЕ КАМЕРЫ В STAGE:
         *    - Отменяем grace period (если был)!
         *    - Перемещаем в конец зоны камер в stage
         *    - Обновляем participantsOrder
         * 
         * 4. ВКЛЮЧЕНИЕ КАМЕРЫ ВНЕ STAGE:
         *    - Отменяем grace period (если был)!
         *    - Обновляем participantsOrder
         *    - Ищем жертву (последний БЕЗ камеры в stage)
         *    - Если нашли → вытесняем, занимаем его место
         * 
         * Визуализация вытеснения:
         * Stage: [cam1(2), cam2(2), no_cam1(1), no_cam2(1)]
         * 
         * user_X (вне stage) включает камеру:
         * 1. Ищем жертву: no_cam2 (последний без камеры)
         * 2. Вытесняем no_cam2
         * 3. Вставляем user_X в конец зоны камер
         * 
         * Результат: [cam1(2), cam2(2), user_X(2), no_cam1(1)]
         */
        toggleCam(id) {
            if (id === 'me') return;
            if (!this.participants[id]) return;

            const participant = this.participants[id];
            const isOnStage = this.stage.includes(id);

            // КРИТИЧНО: Отменяем grace period при включении камеры!
            // Это спасает участника от вытеснения
            if (!participant.cam && this.gracePeriodTimers[id]) {
                clearTimeout(this.gracePeriodTimers[id]);
                delete this.gracePeriodTimers[id];
                // Теперь приоритет вырастет (cam=true) → останется в stage
            }

            // ============ ВЫКЛЮЧЕНИЕ КАМЕРЫ ============
            if (participant.cam) {
                participant.cam = false;

                // --- Выключил камеру В STAGE ---
                if (isOnStage) {
                    // 1. Удаляем из stage
                    const stageIndex = this.stage.indexOf(id);
                    if (stageIndex > -1) {
                        this.stage.splice(stageIndex, 1);
                    }

                    // 2. Перемещаем в зону БЕЗ камер в participantsOrder
                    const orderIndex = this.participantsOrder.indexOf(id);
                    if (orderIndex > -1) {
                        this.participantsOrder.splice(orderIndex, 1);
                    }

                    // Ищем куда вставить (перед первым без камеры)
                    const firstNoCamIndex = this.participantsOrder.findIndex(otherId => {
                        return !this.participants[otherId].cam;
                    });

                    if (firstNoCamIndex !== -1) {
                        this.participantsOrder.splice(firstNoCamIndex, 0, id);
                    } else {
                        this.participantsOrder.push(id);
                    }

                    // 3. Ищем замену (первый с камерой вне stage)
                    const replacement = this.participantsOrder.find(otherId => {
                        return this.participants[otherId].cam && !this.stage.includes(otherId);
                    });

                    if (replacement) {
                        this.stage.push(replacement);
                    }

                    this.updateStage();  // Пересобираем stage
                }
                // --- Выключил камеру ВНЕ STAGE ---
                else {
                    // Просто перемещаем в зону БЕЗ камер
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

                // --- Включил камеру В STAGE ---
                if (isOnStage) {
                    // 1. Перемещаем в конец зоны камер В stage
                    const currentIndex = this.stage.indexOf(id);
                    if (currentIndex > -1) {
                        this.stage.splice(currentIndex, 1);
                    }

                    // Ищем последнего с камерой в stage
                    let lastCamInStage = -1;
                    for (let i = this.stage.length - 1; i >= 0; i--) {
                        if (this.participants[this.stage[i]].cam) {
                            lastCamInStage = i;
                            break;
                        }
                    }
                    this.stage.splice(lastCamInStage + 1, 0, id);

                    // 2. Перемещаем в зону камер В participantsOrder
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
                }
                // --- Включил камеру ВНЕ STAGE ---
                else {
                    // 1. Перемещаем в зону камер в participantsOrder
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

                    // 2. Пытаемся попасть в stage (вытесняя последнего БЕЗ камеры)
                    let victimIndex = -1;
                    for (let i = this.stage.length - 1; i >= 0; i--) {
                        if (!this.participants[this.stage[i]].cam) {
                            victimIndex = i;  // Последний без камеры = жертва
                            break;
                        }
                    }

                    // Если нашли жертву → вытесняем
                    if (victimIndex !== -1) {
                        this.stage.splice(victimIndex, 1);

                        // Вставляем себя в конец зоны камер
                        let lastCamInStage = -1;
                        for (let i = this.stage.length - 1; i >= 0; i--) {
                            if (this.participants[this.stage[i]].cam) {
                                lastCamInStage = i;
                                break;
                            }
                        }
                        this.stage.splice(lastCamInStage + 1, 0, id);
                    }
                }
            }

            // Если НЕ попал в stage → пересчитываем
            const nowOnStage = this.stage.includes(id);
            if (this.stage.length > 0 && !nowOnStage) {
                this.updateStage();
            }
        },

        /**
         * Пересобирает stage с нуля по приоритетам
         * 
         * Алгоритм:
         * 1. Если ≤11 участников → stage не нужен (stage = [])
         * 2. Если >11:
         *    - Сортируем всех по приоритету (от 4 до 1)
         *    - Берем топ-11
         *    - Группируем: [камеры, без_камер]
         *    - stage = результат
         * 
         * Визуализация:
         * 
         * participantsOrder (17 человек):
         * [cam1(2), cam2(4), cam3(2), user_X(3), no_cam1(1), no_cam2(2), ...]
         * 
         * ↓ Сортируем по приоритету
         * 
         * [cam2(4), user_X(3), cam1(2), cam3(2), no_cam2(2), no_cam1(1), ...]
         *  ↑ высший                                            ↑ низший
         * 
         * ↓ Берем топ-11
         * 
         * top11: [cam2(4), user_X(3), cam1(2), cam3(2), no_cam2(2), ...]
         * 
         * ↓ Группируем: камеры | без камер
         * 
         * stage: [cam2, cam1, cam3, no_cam2, user_X, ...]
         *         └── с камерами ──┘  └── без камер ──┘
         */
        updateStage() {
            const PAGE_SIZE = 11;

            // Если мало участников → stage не нужен
            if (this.participantsOrder.length <= PAGE_SIZE) {
                this.stage = [];
                return;
            }

            // Сортируем всех по приоритету (от большего к меньшему)
            const allByPriority = [...this.participantsOrder].sort((a, b) => {
                return this.getPriority(b) - this.getPriority(a);
            });

            // Берем топ-11 по приоритету
            const top11 = allByPriority.slice(0, PAGE_SIZE);

            // Группируем топ-11: камеры впереди, без камер сзади
            const withCam = [];
            const withoutCam = [];

            for (const id of top11) {
                if (this.participants[id].cam) {
                    withCam.push(id);
                } else {
                    withoutCam.push(id);
                }
            }

            // Собираем stage: [камеры..., без_камер...]
            this.stage = [...withCam, ...withoutCam];
        },

        /**
         * Листает на следующую страницу
         */
        nextPage() {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
            }
        },

        /**
         * Листает на предыдущую страницу
         */
        prevPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
            }
        }
    }
}
</script>

<style>
/* Сброс стилей */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

/* Основной контейнер на весь экран */
.wrapper {
    min-height: 100vh;
    max-height: 100vh;
    overflow: hidden;
    display: flex;
    background: #1a1a1a;
    color: #fff;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Inter", Roboto, "Helvetica Neue", sans-serif;
}

/* Левый сайдбар со списком */
.sidebar-left {
    display: flex;
    flex-direction: column;
    background: #2a2a2a;
    overflow-y: auto;
    min-width: 240px;
    max-width: 260px;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
}

/* Кнопка добавления участника */
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

/* Область с сеткой видео */
.grid-area {
    flex: 1;
    display: flex;
    align-items: center;
    position: relative;
    justify-content: center;
    background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.06) 0%, rgba(0, 0, 0, 0) 60%);
}

/* Кнопки навигации */
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

/* Индикатор страницы */
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