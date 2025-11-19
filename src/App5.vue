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
      participantsOrder: [],
      stage: [],
      nextJoinOrder: 1,
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

      const startIndex = (this.currentPage - 1) * PAGE_SIZE;
      const endIndex = startIndex + PAGE_SIZE;

      const pageIds = this.participantsOrder.slice(startIndex, endIndex);
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
      return Math.ceil(this.participantsOrder.length / 11) || 1;
    },

    hasNextPage() {
      return this.currentPage < this.totalPages;
    },

    hasPrevPage() {
      return this.currentPage > 1;
    },
  },

  mounted() {
    const mediaStore = useMediaStore()
    mediaStore.initMyCamera()
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
    },

    removeParticipant(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const index = this.participantsOrder.indexOf(id);
      if (index > -1) {
        this.participantsOrder.splice(index, 1);
      }

      delete this.participants[id];
    },

    toggleMic(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      this.participants[id].mic = !this.participants[id].mic;
    },

    toggleCam(id) {
      if (id === 'me') return;
      if (!this.participants[id]) return;

      const participant = this.participants[id];
      const currentIndex = this.participantsOrder.indexOf(id);

      if (participant.cam) {
        participant.cam = false;

        this.participantsOrder.splice(currentIndex, 1);

        const firstNoCamIndex = this.participantsOrder.findIndex(otherId => {
          return !this.participants[otherId].cam;
        });

        if (firstNoCamIndex !== -1) {
          this.participantsOrder.splice(firstNoCamIndex, 0, id);
        } else {
          this.participantsOrder.push(id);
        }

      } else {
        participant.cam = true;

        this.participantsOrder.splice(currentIndex, 1);

        let lastCamIndex = -1;
        for (let i = this.participantsOrder.length - 1; i >= 0; i--) {
          if (this.participants[this.participantsOrder[i]].cam) {
            lastCamIndex = i;
            break;
          }
        }

        this.participantsOrder.splice(lastCamIndex + 1, 0, id);
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
