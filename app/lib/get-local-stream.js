import { mediaDevices } from "react-native-webrtc"

export const getLocalStream = () => new Promise((resolve, reject) => {
  mediaDevices.enumerateDevices().then((sourceInfos) => {
    let videoSourceId;
    for (let i = 0; i < sourceInfos.length; i++) {
      const sourceInfo = sourceInfos[i];
      if (sourceInfo.kind == "videoinput" && sourceInfo.facing == "front") {
        videoSourceId = sourceInfo.deviceId;
      }
    }
    mediaDevices.getUserMedia({
      audio: true,
      video: {
        width: 1280,
        height: 720,
        frameRate: 15,
        facingMode: "user",
        deviceId: videoSourceId
      }
    })
      .then(stream => {
        resolve(stream)
      })
      .catch(error => {
        reject({ message: "Local Stream fetch error" })
      });

  }).catch((e) => {
    reject({ message: "Device List fetch error" })
  })
})
