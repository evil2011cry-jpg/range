<template>
    <div class="wrapper">
        <div class="sidebar-left">

            <button @click="addParticipant" class="add-btn">+ Добавить</button>

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

export default {
    components: {
        Grid,
        ParticipantsList
    },

    data() {
        return {
            currentPage: 1,
            participants: {},
            nextJoinOrder: 1,
            speakingTimers: {},
            recentlySpeaking: {},
            firstNames: ['Мария', 'Дмитрий', 'Анна', 'Сергей', 'Елена', 'Иван', 'Ольга', 'Андрей', 'Татьяна', 'Максим', 'Наталья', 'Павел', 'Юлия', 'Владимир', 'Петр'],
            lastNames: ['Иванов', 'Петров', 'Сидоров', 'Смирнов', 'Козлов', 'Новиков', 'Морозов', 'Волков', 'Соколов', 'Лебедев', 'Попов', 'Васильев', 'Федоров', 'Михайлов', 'Семенов']
        }
    },

    computed: {
        allParticipants() {
            return Object.values(this.participants);
        },

        maxJoinOrder() {
            return this.nextJoinOrder - 1;
        },

        camsGroup() {
            return this.allParticipants.filter(p => p.cam);
        },

        noCamsGroup() {
            return this.allParticipants.filter(p => !p.cam);
        },

        isSpeakingLike() {
            return (p) => !!p.mic || !!this.recentlySpeaking[p.id];
        },

        sortGroup() {
            return (group) => {
                return group.sort((a, b) => {
                    const scoreA = (this.isSpeakingLike()(a) ? 100 : 0) +
                        (a.pinned ? 50 : 0) +
                        (this.maxJoinOrder - a.joinOrder);

                    const scoreB = (this.isSpeakingLike()(b) ? 100 : 0) +
                        (b.pinned ? 50 : 0) +
                        (this.maxJoinOrder - b.joinOrder);

                    if (scoreA !== scoreB) return scoreB - scoreA; // Desc по score
                    return a.joinOrder - b.joinOrder; // Asc по joinOrder для стабильности
                });
            };
        },

        sortedAll() {
            const sortedCams = this.sortGroup()(this.camsGroup);
            const sortedNoCams = this.sortGroup()(this.noCamsGroup);
            return [...sortedCams, ...sortedNoCams];
        },

        sortedParticipants() {
            const me = {
                id: 'me',
                name: 'Алексей',
                mic: true,
                cam: true,
                joinOrder: 0,
                pinned: true
            };

            const PAGE_OTHERS = 11;

            const buildFirstPage = () => {
                // 1. Базовый пул: первые 11 из sortedAll
                let basePool = this.sortedAll.slice(0, PAGE_OTHERS);

                // 2. Защищенные: pinned + cam в basePool
                const protectedSet = new Set(
                    basePool.filter(p => p.cam && p.pinned).map(p => p.id)
                );

                // 3. Внешние speaking
                const speakersOutside = this.sortedAll
                    .slice(PAGE_OTHERS)
                    .filter(p => this.isSpeakingLike()(p));

                // Массивы для arrived
                const arrivedCams = [];
                const arrivedNoCams = [];

                // 4. Для каждого внешнего speaking
                for (const spk of speakersOutside) {
                    if (basePool.find(p => p.id === spk.id)) continue;

                    // Ищем последнего кандидата на вытеснение
                    const findKickIndexLast = (preferNoCam) => {
                        for (let i = basePool.length - 1; i >= 0; i--) {
                            const p = basePool[i];
                            if (this.isSpeakingLike()(p)) continue;
                            if (protectedSet.has(p.id)) continue;
                            const matches = preferNoCam ? !p.cam : p.cam;
                            if (matches) return i;
                        }
                        return -1;
                    };

                    let kickIndex = findKickIndexLast(true); // Предпочтительно no_cam
                    if (kickIndex === -1) kickIndex = findKickIndexLast(false);

                    if (kickIndex === -1) continue;

                    // Вытесняем
                    basePool.splice(kickIndex, 1);

                    // Добавляем в arrived
                    if (spk.cam) {
                        arrivedCams.push(spk);
                        if (spk.pinned) protectedSet.add(spk.id);
                    } else {
                        arrivedNoCams.push(spk);
                    }
                };

                // 5. Разбиваем basePool на core группы
                const coreCams = basePool.filter(p => p.cam);
                const coreNoCams = basePool.filter(p => !p.cam);

                // Собираем с arrived
                const camsGroup = [...coreCams, ...arrivedCams];
                const noCamsGroup = [...coreNoCams, ...arrivedNoCams];

                // Сортируем внутри (мягко)
                this.sortGroup()(camsGroup);
                this.sortGroup()(noCamsGroup);

                // Финал: cams + no_cams
                let finalPage = [...camsGroup, ...noCamsGroup].slice(0, PAGE_OTHERS);
                return finalPage;
            };

            if (this.currentPage === 1) {
                const page1Pool = buildFirstPage();
                return [me, ...page1Pool];
            }

            // Для других страниц: остаток sortedAll после page1
            const page1Pool = buildFirstPage();
            const page1Ids = new Set(page1Pool.map(p => p.id));
            const remaining = this.sortedAll.filter(p => !page1Ids.has(p.id));

            const startIndex = (this.currentPage - 2) * PAGE_OTHERS;
            const endIndex = startIndex + PAGE_OTHERS;
            const pagePool = remaining.slice(startIndex, endIndex);

            return [me, ...pagePool];
        },

        allParticipantsForList() {
            const me = {
                id: 'me',
                name: 'Алексей',
                mic: true,
                cam: true,
                joinOrder: 0
            };
            return [me, ...this.sortedAll];
        },

        totalParticipants() {
            return this.allParticipants.length + 1;
        },

        totalPages() {
            return Math.ceil(this.allParticipants.length / 11) || 1;
        },

        hasNextPage() {
            return this.currentPage < this.totalPages;
        },

        hasPrevPage() {
            return this.currentPage > 1;
        }
    },

    mounted() {
        const mediaStore = useMediaStore();
        mediaStore.initMyCamera();
    },

    beforeUnmount() {
        Object.values(this.speakingTimers).forEach(timerId => clearTimeout(timerId));
        this.speakingTimers = {};
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
                joinOrder: this.nextJoinOrder,
                pinned: false
            };

            this.nextJoinOrder++;
        },

        removeParticipant(id) {
            if (!this.participants[id]) return;

            if (this.speakingTimers[id]) {
                clearTimeout(this.speakingTimers[id]);
                delete this.speakingTimers[id];
            }
            delete this.recentlySpeaking[id];
            delete this.participants[id];
        },

        toggleMic(id) {
            if (id === 'me' || !this.participants[id]) return;

            const participant = this.participants[id];
            participant.mic = !participant.mic;

            if (participant.mic) {
                if (this.speakingTimers[id]) {
                    clearTimeout(this.speakingTimers[id]);
                    delete this.speakingTimers[id];
                }
                this.recentlySpeaking[id] = false;
            } else {
                this.recentlySpeaking[id] = true;
                this.speakingTimers[id] = setTimeout(() => {
                    this.recentlySpeaking[id] = false;
                    delete this.speakingTimers[id];
                }, 2000);
            }
        },

        toggleCam(id) {
            if (id === 'me' || !this.participants[id]) return;

            const participant = this.participants[id];
            participant.cam = !participant.cam;

            const isSpeakingLikeNow = !!participant.mic || !!this.recentlySpeaking[id];

            if (!participant.cam) {
                participant.pinned = false;
            } else {
                if (isSpeakingLikeNow) {
                    participant.pinned = true;
                }
                if (this.speakingTimers[id]) {
                    clearTimeout(this.speakingTimers[id]);
                    delete this.speakingTimers[id];
                }
            }
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
        }
    }
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
}

.sidebar-left {
    display: flex;
    flex-direction: column;
    background: #2a2a2a;
    overflow-y: auto;
}

.add-btn {
    margin: 15px;
    padding: 10px 20px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
}

.add-btn:hover {
    background: #45a049;
}

.grid-area {
    flex: 1;
    display: flex;
    align-items: center;
    position: relative;
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
    z-index: 10;
}
</style>