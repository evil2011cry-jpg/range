import { defineStore } from 'pinia'
import { shallowRef, ref } from 'vue'

export const useMediaStore = defineStore('media', () => {
  const myStream = shallowRef(null)
  const isCameraEnabled = ref(false)
  const isMicEnabled = ref(false)

  const getVideoConstraints = () => ({
    video: {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 360, max: 720 },
      frameRate: { ideal: 24, max: 30 },
      facingMode: 'user'
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })

  async function initMyCamera() {
    try {
      myStream.value = await navigator.mediaDevices.getUserMedia(getVideoConstraints())
      isCameraEnabled.value = true
      isMicEnabled.value = true
    } catch (err) {
      console.error('Camera error:', err)
      isCameraEnabled.value = false
      isMicEnabled.value = false
    }
  }

  function stopMyCamera() {
    if (myStream.value) {
      myStream.value.getTracks().forEach(track => track.stop())
      myStream.value = null
      isCameraEnabled.value = false
      isMicEnabled.value = false
    }
  }

  return {
    myStream,
    isCameraEnabled,
    isMicEnabled,
    initMyCamera,
    stopMyCamera
  }
})