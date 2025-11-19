<!-- Что-то работающее -->

<template>
  <div class="wrapper">
    <div class="sidebar-left">

      <button @click="addParticipant" class="add-btn">+ Добавить</button>

      <ParticipantsList
        :participants="allParticipantsForList"
        @toggle-mic="toggleMic"
        @toggle-cam="toggleCam"
        @remove-participant="removeParticipant"
      />
    </div>

    <div class="grid-area">
      <button
        v-if="hasPrevPage"
        @click="prevPage"
        class="nav-btn nav-prev"
      >
        ←
      </button>

      <Grid
        :participants="sortedParticipants"
        @toggle-mic="toggleMic"
        @toggle-cam="toggleCam"
        @remove-participant="removeParticipant"
      />

      <button
        v-if="hasNextPage"
        @click="nextPage"
        class="nav-btn nav-next"
      >
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
        no_cams: [],
      },
      nextJoinOrder: 1,
      speakingTimers: {},
      recentlySpeaking: {},
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

      const isActuallyLive = (p) => {
        return !!(p && p.mic);
      };

      const kickPriority = (p) => {
        if (!p) return null;
        if (isActuallyLive(p)) return null;

        if (!p.cam) return 0;
        if (p.cam && !p.pinned) return 1;
        if (p.cam && p.pinned) return 2;
        return null;
      };

      const buildFirstPage = () => {
        const pagePool = allOrdered.slice(0, PAGE_OTHERS);

        const speakersOutside = allOrdered
          .slice(PAGE_OTHERS)
          .filter(p => p && isSpeakingLike(p));

        for (const spk of speakersOutside) {
          if (pagePool.find(p => p && p.id === spk.id)) {
            continue;
          }

          if (pagePool.length === 0) {
            pagePool.push(spk);
            continue;
          }

          const lastPos = pagePool.length - 1;

          let victimIndex = -1;
          for (let desiredPrio = 0; desiredPrio <= 2 && victimIndex === -1; desiredPrio++) {
            for (let i = lastPos; i >= 0; i--) {
              const prio = kickPriority(pagePool[i]);
              if (prio === desiredPrio) {
                victimIndex = i;
                break;
              }
            }
          }

          if (victimIndex === -1) {
            continue;
          }

          if (victimIndex === lastPos) {
            pagePool[lastPos] = spk;
          } else {
            for (let i = victimIndex; i < lastPos; i++) {
              pagePool[i] = pagePool[i + 1];
            }
            pagePool[lastPos] = spk;
          }
        }

        return pagePool;
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
        joinOrder: 0,
        pinned: true
      };

      const allOrdered = [
        ...this.range.cams.map(id => this.participants[id]),
        ...this.range.no_cams.map(id => this.participants[id])
      ].filter(Boolean);

      return [me, ...allOrdered];
    },

    totalParticipants() {
      return Object.keys(this.participants).length + 1;
    },

    totalPages() {
      const othersCount = Object.keys(this.participants).length;
      return Math.ceil(othersCount / 11) || 1;
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
        const camsIndex = this.range.cams.indexOf(id);
        if (camsIndex > -1) {
          this.range.cams.splice(camsIndex, 1);
        }

        this.range.no_cams.unshift(id);

        participant.cam = false;

        participant.pinned = false;

      } else {
        const noIndex = this.range.no_cams.indexOf(id);
        if (noIndex > -1) {
          this.range.no_cams.splice(noIndex, 1);
        }

        this.range.cams.push(id);

        participant.cam = true;

        if (isSpeakingLikeNow()) {
          participant.pinned = true;
        }

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
  border-right: 1px solid rgba(255,255,255,0.07);
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

.grid-area {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
  justify-content: center;
  background: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 60%);
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
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 10px 40px rgba(0,0,0,0.8);
  backdrop-filter: blur(4px);
}
</style>
