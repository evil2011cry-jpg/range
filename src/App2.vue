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
      range: {
        cams: [],
        no_cams: []
      },
      nextJoinOrder: 1,

      speakingTimers: {},
      recentlySpeaking: {},

      firstNames: ['Мария', 'Дмитрий', 'Анна', 'Сергей', 'Елена', 'Иван', 'Ольга', 'Андрей', 'Татьяна', 'Максим', 'Наталья', 'Павел', 'Юлия', 'Владимир', 'Петр'],
      lastNames: ['Иванов', 'Петров', 'Сидоров', 'Смирнов', 'Козлов', 'Новиков', 'Морозов', 'Волков', 'Соколов', 'Лебедев', 'Попов', 'Васильев', 'Федоров', 'Михайлов', 'Семенов']
    }
  },

  computed: {
    sortedParticipants() {
      const me = {
        id: 'me',
        name: 'Алексей',
        mic: true,
        cam: true,
        joinOrder: 0,
        pinned: true
      };

      const allOrdered = [
        ...this.range.cams.map(id => this.participants[id]),
        ...this.range.no_cams.map(id => this.participants[id])
      ].filter(Boolean);

      const PAGE_OTHERS = 11;

      const isSpeakingLike = (p) => {
        if (!p) return false;
        return !!p.mic || !!this.recentlySpeaking[p.id];
      };

      const buildFirstPage = () => {
        // 1. Берём первые 11 по дефолтному порядку
        let basePool = allOrdered.slice(0, PAGE_OTHERS);

        // 2. Защищены только pinned + cam
        const protectedSet = new Set(
          basePool
            .filter(p => p && p.cam && p.pinned)
            .map(p => p.id)
        );

        // 3. Говорящие за пределами первых 11
        const speakersOutside = allOrdered
          .slice(PAGE_OTHERS)
          .filter(p => p && isSpeakingLike(p));

        // Массивы для новоприбывших
        const arrivedCams = [];
        const arrivedNoCams = [];

        // 4. Обрабатываем каждого внешнего говорящего
        for (const spk of speakersOutside) {
          if (basePool.find(p => p.id === spk.id)) {
            continue;
          }

          const findKickIndex = (preferNoCam) => {
            return basePool.findIndex(p => {
              if (!p) return false;
              if (isSpeakingLike(p)) return false;
              if (protectedSet.has(p.id)) return false;

              if (preferNoCam) {
                return !p.cam;
              } else {
                return p.cam;
              }
            });
          };

          // Пытаемся выкинуть тихого без камеры
          let kickIndex = findKickIndex(true);

          // Если не нашли - тихого с камерой (не pinned)
          if (kickIndex === -1) {
            kickIndex = findKickIndex(false);
          }

          // Некого кикать
          if (kickIndex === -1) {
            continue;
          }

          // 4.1 Удаляем того, кого кикнули
          basePool.splice(kickIndex, 1);

          // 4.2 Кладём спикера в правильную очередь
          if (spk.cam) {
            arrivedCams.push(spk);
            if (spk.pinned) {
              protectedSet.add(spk.id);
            }
          } else {
            arrivedNoCams.push(spk);
          }
        }

        // 5. Собираем итоговую страницу аккуратно
        const coreCams = [];
        const coreNoCams = [];
        
        for (const p of basePool) {
          if (p.cam) {
            coreCams.push(p);
          } else {
            coreNoCams.push(p);
          }
        }

        // Порядок: старые камеры → новые камеры → старые без камер → новые без камер
        let finalPage = [
          ...coreCams,
          ...arrivedCams,
          ...coreNoCams,
          ...arrivedNoCams
        ];

        // Страховка от переполнения
        if (finalPage.length > PAGE_OTHERS) {
          finalPage = finalPage.slice(0, PAGE_OTHERS);
        }

        return finalPage;
      };

      if (this.currentPage === 1) {
        const page1Pool = buildFirstPage();
        return [me, ...page1Pool];
      }

      const page1Pool = buildFirstPage();
      const page1Ids = new Set(page1Pool.map(p => p.id));

      const remaining = allOrdered.filter(p => p && !page1Ids.has(p.id));

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

      const allOrdered = [
        ...this.range.cams.map(id => this.participants[id]),
        ...this.range.no_cams.map(id => this.participants[id])
      ];

      return [me, ...allOrdered];
    },

    totalParticipants() {
      return Object.keys(this.participants).length + 1;
    },

    totalPages() {
      const participantsCount = Object.keys(this.participants).length;
      return Math.ceil(participantsCount / 11) || 1;
    },

    hasNextPage() {
      return this.currentPage < this.totalPages;
    },

    hasPrevPage() {
      return this.currentPage > 1;
    }
  },

  mounted() {
    const mediaStore = useMediaStore()
    mediaStore.initMyCamera()
  },

  beforeUnmount() {
    Object.values(this.speakingTimers).forEach(timerId => {
      clearTimeout(timerId);
    });
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

      if (hasCam) {
        this.range.cams.push(id);
      } else {
        this.range.no_cams.push(id);
      }

      this.nextJoinOrder++;
    },

    removeParticipant(id) {
      if (!this.participants[id]) return;

      if (this.speakingTimers[id]) {
        clearTimeout(this.speakingTimers[id]);
        delete this.speakingTimers[id];
      }
      delete this.recentlySpeaking[id];

      const camsIndex = this.range.cams.indexOf(id);
      if (camsIndex > -1) {
        this.range.cams.splice(camsIndex, 1);
      }

      const noCamsIndex = this.range.no_cams.indexOf(id);
      if (noCamsIndex > -1) {
        this.range.no_cams.splice(noCamsIndex, 1);
      }

      delete this.participants[id];
    },

    toggleMic(id) {
      if (id === 'me') {
        return;
      }

      if (!this.participants[id]) return;

      const newMicState = !this.participants[id].mic;
      this.participants[id].mic = newMicState;

      if (newMicState) {
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
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const participant = this.participants[id];
      const newCamState = !participant.cam;

      const isSpeakingLikeNow = () => {
        return !!participant.mic || !!this.recentlySpeaking[id];
      };

      if (participant.cam) {
        // ВЫКЛЮЧАЕТ камеру
        const camsIndex = this.range.cams.indexOf(id);
        if (camsIndex > -1) {
          this.range.cams.splice(camsIndex, 1);
        }
        this.range.no_cams.unshift(id);

        participant.cam = false;
        participant.pinned = false;

      } else {
        // ВКЛЮЧАЕТ камеру

        // Убираем из no_cams
        const noIndex = this.range.no_cams.indexOf(id);
        if (noIndex > -1) {
          this.range.no_cams.splice(noIndex, 1);
        }

        // ПРОСТО ДОБАВЛЯЕМ В КОНЕЦ! (без умной позиции)
        this.range.cams.push(id);

        participant.cam = true;

        // Если говорит сейчас - закрепляем
        if (isSpeakingLikeNow()) {
          participant.pinned = true;
        }

        // Отменяем таймер
        if (this.speakingTimers[id]) {
          clearTimeout(this.speakingTimers[id]);
          delete this.speakingTimers[id];
        }
      }
    },

    nextPage() {
      const maxPage = Math.ceil(this.totalParticipants / 11);
      if (this.currentPage < maxPage) {
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