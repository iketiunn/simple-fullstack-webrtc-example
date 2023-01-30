import { StyleSheet, Text, Button, View, TextInput } from 'react-native';
import React, {useState, useEffect} from 'react';
import {
  RTCView,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import Peer from 'react-native-peerjs';
import { io } from "socket.io-client";
import { getLocalStream } from './lib/get-local-stream';

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302'},
    //{ urls: 'turn:0.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
  ]
}

const peerjsServer = '192.168.50.38'
const createPub = (name) => new Peer(name, { host: peerjsServer, secure: false ,port: 9000, path: '/peer', config, debug: 0 })
const connectWs = () => io(`http://${peerjsServer}:9000`, { path: '/ws' })
const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    display: 'flex',
    backgroundColor: '#FFF',
  },
  container: {
    paddingVertical: 16,
    paddingHorizontal: 60,
  },
  row: {
    paddingVertical: 4
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    padding: 8,
  }
});

const App = () => {
  const [peers, setPeers] = useState([])
  const [name, setName] = useState('mobile-user' + Math.floor(Math.random() * 1000))
  const [pub, setPub] = useState({ peer: null, ws: null, wsInited: false, stream: null })
  const [isMute, setIsMute] = useState(true)
  const [room, setRoom] = useState('test-room-1')
  const [isConnected, setIsConnected] = useState(false)

  // Socket get new instance everytime when re-rendered
  useEffect(() => {
    if (pub.peer === null) return

    pub.ws.on(`room:${room}:join`, ({ peerId, name: peerName }) => {
      if (peerId === pub?.peer?.id) return
      console.log('join', peerId, peerName)

      callPeer(peerId, peerName)
    })
    pub.ws.on(`room:${room}:leave`, ({ peerId }) => {
      // If in conference, close the peer
      console.log('hand up peer', peerId)
      hangUpPeer(peerId)
    })

    // Peerjs events
    pub.peer.on('open', id => {
      console.log('Connect peer as', id)
      pub.ws.emit('join', { room, name, peerId: id })
      setPub({ ...pub })
    })
    // Response to the caller
    pub.peer.on('call', call => {
      console.log('Answer call')
      call.answer(pub.stream)
      let count = 0 // every tracks will emit one stream event, so when both audio & video publish we will get two stream events
      call.on('stream', () => {
        // We only need to setRemoteStream once
        if (count > 0) return
        count++

        setPeers(prev => [...prev, { peer: call }])
      })
      call.on('close', () => {
        console.log('call close')
        //pub.stream.getTracks().forEach(track => track.stop())
        hangUpPeer(call.peer)
      })
    })
    pub.peer.on('error', err => {
      console.error(err)
    })

    return () => {
      pub.ws.off(`room:${room}:join`)
      pub.ws.off(`room:${room}:leave`)
      pub.peer.off('open')
      pub.peer.off('call')
      pub.peer.off('error')
    }
  }, [pub])

  async function connectToRoom() {
    InCallManager.start({ media: 'video' }) // make audio output to speaker
    InCallManager.setKeepScreenOn(true)
    const stream = await getLocalStream({ audio: true, video: true }) // disable video for example
    const peer = createPub()
    const ws = connectWs()
    console.log('Connect ws')
    
    setPub(prev => ({ ...prev, peer, ws, wsInited: true, stream }))
    setIsConnected(true)
  }

  function callPeer(id, peerName) {
    if (!pub.peer) {
      console.error('Peer not ready', pub)
      return
    }
    console.log('send stream', pub.stream)
    const call = pub.peer.call(id, pub.stream, { metadata: { from: name } })
    if (!call) {
      console.error(`call failed for ${id} from ${pub.peer.id}`)
      return
    }
    let count = 0 // every tracks will emit one stream event, so when both audio & video publish we will get two stream events
    call.on('stream', (stream) => {
      // We only need to setRemoteStream once
      if (count > 0) return
      count++

      console.log('get stream!')
    })
    call.on('close', () => {
      setPeers(prev => prev.filter(i => i.peer.id !== call.peer.id))
    })

    setPeers(prev => [...prev, { peer: call, name: peerName }])
  }

  function hangUpPeer(id) {
    setPeers(prev => {
      const peer = prev.find(i => i.peer.peer === id)
      peer && peer.peer.close()
      const rest = prev.filter(i => i.peer.peer !== id)

      return rest
    })
  }

  function disconnect() {
    // Clear all
    console.log('Disconnect')
    InCallManager.stop()
    peers.forEach(peer => peer.peer.close())
    pub.peer && pub.peer.destroy()
    pub.ws && pub.ws.disconnect()
    setPub({ peer: null, ws: null, wsInited: false,stream: null })
    setPeers([])
    setIsConnected(false)
    console.log('Disconnected')
  }

  useEffect(() => {
    if (isConnected) return
    //connectToRoom()

    return () => {
      //disconnect()
      console.log('clear')
    }
  }, [isConnected])

  return <View style={styles.container}>
    <Text style={styles.row}>Name</Text>
    <TextInput style={styles.input} value={name} onChangeText={setName} />
    <Text style={styles.row}>Room</Text>
    <TextInput style={styles.input} value={room} onChangeText={setRoom} />
    <Text style={styles.row}>id: {pub?.peer?.id ? pub.peer.id : 'not connected'}</Text>
    <View style={styles.row}>
    <Button title="Reconnect" onPress={() => {
      disconnect();
      connectToRoom();
    }} />
    </View>
    {/*
      <RTCView streamURL={pub.stream?.toURL()} style={styles.viewer} />
    */}
      {peers.map((p, i) => {
          return (
            <View key={i} style={styles.row}>
              <Text>{p.name || p.peer.metadata.from /* name for caller, from for answerer */ } / { p.peer.peer }</Text>
              { p?.peer?.remoteStream && <RTCView streamURL={p.peer.remoteStream.toURL()} style={styles.viewer} />}
            </View>
          )
        })
      }
    </View>
};

export default App;
