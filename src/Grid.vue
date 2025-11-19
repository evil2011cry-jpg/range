<template>
  <div class="grid">
    <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="row">
      <ParticipantCard v-for="participant in row" :key="participant.id" :participant="participant" :width="itemWidth"
        @toggle-mic="$emit('toggle-mic', $event)" @toggle-cam="$emit('toggle-cam', $event)"
        @remove-participant="$emit('remove-participant', $event)" />
    </div>
  </div>
</template>

<script>
import ParticipantCard from './ParticipantCard.vue'

export default {
  components: {
    ParticipantCard
  },

  props: {
    participants: {
      type: Array,
      default: () => []
    }
  },

  data() {
    return {
      itemWidth: 0
    }
  },

  computed: {
    visibleParticipants() {
      return this.participants.slice(0, 12);
    },

    count() {
      return this.visibleParticipants.length;
    },

    columns() {
      if (this.count === 1) return 1;
      if (this.count === 2) return 2;
      if (this.count <= 4) return 2;
      if (this.count <= 9) return 3;
      return 4;
    },

    rowsCount() {
      return Math.ceil(this.count / this.columns);
    },

    rows() {
      const result = [];
      const items = [...this.visibleParticipants];

      for (let i = 0; i < items.length; i += this.columns) {
        result.push(items.slice(i, i + this.columns));
      }

      return result;
    }
  },

  watch: {
    rowsCount() {
      this.calculateItemWidth();
    },
    columns() {
      this.calculateItemWidth();
    }
  },

  mounted() {
    this.calculateItemWidth();
    window.addEventListener('resize', this.calculateItemWidth);
  },

  beforeUnmount() {
    window.removeEventListener('resize', this.calculateItemWidth);
  },

  methods: {
    calculateItemWidth() {
      const sidebarWidth = 250;
      const padding = 40;
      const gap = 10;
      const safetyMargin = 20;

      const totalGapsH = (this.columns - 1) * gap;
      const availableWidth = window.innerWidth - sidebarWidth - padding;
      const widthBasedSize = (availableWidth - totalGapsH) / this.columns;

      const totalGapsV = (this.rowsCount - 1) * gap;
      const availableHeight = window.innerHeight - totalGapsV - safetyMargin;
      const heightBasedWidth = (availableHeight / this.rowsCount) * (16 / 9);

      this.itemWidth = Math.min(widthBasedSize, heightBasedWidth);
    }
  }
}
</script>

<style scoped>
.grid {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 20px 20px;
  overflow: hidden;
}

.row {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 10px;
}

.row:last-child {
  margin-bottom: 0;
}
</style>