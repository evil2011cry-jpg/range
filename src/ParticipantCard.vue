<template>
    <div class="card" :style="{
        width: width + 'px',
        background: participant.cam ? '#e3f2fd' : '#ffffff',
        borderColor: participant.mic ? '#f44336' : '#000000'
    }">
        <video v-if="participant.cam && mediaStore.myStream" :srcObject="mediaStore.myStream" autoplay playsinline muted
            disablePictureInPicture class="video" />

        <div v-else class="placeholder">
            <div class="name">{{ participant.name }}</div>
        </div>

        <div v-if="participant.cam" class="name-badge">
            {{ participant.name }}
        </div>

        <button v-if="participant.id !== 'me'" @click="$emit('remove-participant', participant.id)" class="remove-btn">
            ✕
        </button>

        <div class="controls">
            <button @click="$emit('toggle-mic', participant.id)" class="btn" :class="{ active: participant.mic }">
                🎤
            </button>
            <button @click="$emit('toggle-cam', participant.id)" class="btn" :class="{ active: participant.cam }">
                📹
            </button>
        </div>
    </div>
</template>

<script>
import { useMediaStore } from '@/stores/media'

export default {
    props: {
        participant: {
            type: Object,
            required: true
        },
        width: {
            type: Number,
            required: true
        }
    },

    emits: ['toggle-mic', 'toggle-cam', 'remove-participant'],

    computed: {
        mediaStore() {
            return useMediaStore()
        }
    }
}
</script>

<style scoped>
.card {
    border: 3px solid;
    aspect-ratio: 16 / 9;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
}

.video {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
}


.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

.name {
    font-size: 18px;
    font-weight: 500;
    z-index: 1;
    color: black;
}

.name-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    z-index: 2;
}

.remove-btn {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 25px;
    height: 25px;
    border: none;
    background: #f44336;
    color: white;
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    z-index: 2;
}

.remove-btn:hover {
    background: #d32f2f;
}

.controls {
    position: absolute;
    bottom: 5px;
    right: 5px;
    display: flex;
    gap: 5px;
    z-index: 2;
}

.btn {
    width: 30px;
    height: 30px;
    border: 1px solid #ccc;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}

.btn:hover {
    background: #f0f0f0;
}

.btn.active {
    background: #4caf50;
    border-color: #4caf50;
}
</style>