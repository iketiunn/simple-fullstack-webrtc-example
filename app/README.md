# WebRTC mobild App

## run development mode in local

```
yarn android
```

## build a production apk

```
eas build -p android --profile preview
```

## install production apk (package name is temp)

```
# remove development build if existed
adb uninstall com.beeinventor.livertc

# install production apk download from eas
adb install production.apk
```

## Reference
- react native: https://reactnative.dev/
- expo: https://docs.expo.dev/
- eas: https://docs.expo.dev/development/create-development-builds/
- peerjs: https://peerjs.com/
