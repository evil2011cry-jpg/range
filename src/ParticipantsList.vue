<template>
  <div class="participants-sidebar">
    <div class="header">
      <span class="title">Участники ({{ participants.length }})</span>
    </div>
    
    <div class="list-scroll">
      <div 
        v-for="participant in participants" 
        :key="participant.id"
        class="participant-item"
      >
        <div class="participant-info">
          <div class="participant-name">{{ participant.name }}</div>
          
          <div class="participant-controls">
            <button 
              @click="$emit('toggle-mic', participant.id)"
              class="control-btn"
              :class="{ active: participant.mic }"
              title="Микрофон"
            >
              🎤
            </button>
            
            <button 
              @click="$emit('toggle-cam', participant.id)"
              class="control-btn"
              :class="{ active: participant.cam }"
              title="Камера"
            >
              📹
            </button>
            
            <button 
              v-if="participant.id !== 'me'"
              @click="$emit('remove-participant', participant.id)"
              class="control-btn remove"
              title="Удалить"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    participants: {
      type: Array,
      default: () => []
    }
  },
  
  emits: ['toggle-mic', 'toggle-cam', 'remove-participant']
}
</script>

<style scoped>
.participants-sidebar {
  background: #2a2a2a;
  border-right: 1px solid #3a3a3a;
  display: flex;
  flex-direction: column;
  width: 250px;
  flex-shrink: 0;
}

.header {
  padding: 15px;
  border-bottom: 1px solid #3a3a3a;
}

.title {
  color: white;
  font-size: 14px;
  font-weight: 600;
}

.list-scroll {
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  padding: 10px;
}

.list-scroll::-webkit-scrollbar {
  width: 6px;
}

.list-scroll::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.list-scroll::-webkit-scrollbar-thumb {
  background: #4a4a4a;
  border-radius: 3px;
}

.participant-item {
  background: #3a3a3a;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
}

.participant-item:last-child {
  margin-bottom: 0;
}

.participant-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.participant-name {
  color: white;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.participant-controls {
  display: flex;
  gap: 4px;
}

.control-btn {
  flex: 1;
  height: 28px;
  border: 1px solid #4a4a4a;
  background: #2a2a2a;
  color: #999;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.control-btn:hover {
  background: #3a3a3a;
}

.control-btn.active {
  background: #4caf50;
  border-color: #4caf50;
  color: white;
}

.control-btn.remove {
  background: #f44336;
  border-color: #f44336;
  color: white;
  flex: 0.5;
}

.control-btn.remove:hover {
  background: #d32f2f;
}
</style>