import { useEffect, useState } from 'react'
import ReactPlayer from 'react-player'
import { Peer } from 'peerjs'
import { io } from "socket.io-client";

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    //{ urls: 'turn:0.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' }
  ]
}
const getLocalStream = async ({ audio, video } = { audio: true, video: true }) => {
  // For now, we can't send blank video from user media
  // https://github.com/peers/peerjs/issues/944
  const userStream = await navigator.mediaDevices.getUserMedia({
    audio,
    video,
  });

  if (video === true) {
    return userStream
  }

  // TODO: draw audio only
  const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 })
  canvas.getContext('2d').fillRect(0, 0, 320, 240)
  canvas.getContext('2d').fillStyle = 'white'
  canvas.getContext('2d').fillText("Sound Only", 10, 50)
  const blankStream = canvas.captureStream(15)
  blankStream.addTrack(userStream.getAudioTracks()[0])

  return blankStream
};

const peerjsServer = 'localhost'
const createPub = () => new Peer({ host: peerjsServer, secure: false, path: '/peer', port: 9000 ,config, debug: 0 })
const connectWs = () => io('http://localhost:9000', { path: '/ws' })

function App() {
  // Peers may update in concurrent events, invoke it with prevState to prevent race condition
  const [peers, setPeers] = useState([])
  const [name, setName] = useState('user' + Math.floor(Math.random() * 1000))
  const [pub, setPub] = useState({ peer: null, ws: null, wsInited: false, stream: null })
  const [isMute, setIsMute] = useState(true)
  const [room, setRoom] = useState('test-room-1')

  // Socket get new instance everytime when re-rendered
  useEffect(() => {
    if (pub.peer === null) return

    pub.ws.on(`room:${room}:join`, ({ peerId, name: peerName }) => {
      if (peerId === pub.peer.id) return
      console.log('join', peerId, peerName)

      callPeer(peerId, peerName)
    })
    pub.ws.on(`room:${room}:leave`, ({ peerId }) => {
      // If in conference, close the peer
      console.log('hand up peer', peerId)

      hangUpPeer(peerId)
    })

    pub.peer.on('open', id => {
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

        console.log('Got call stream')
        setPeers(prev => [...prev, { peer: call }])
      })
      call.on('close', () => {
        console.log('call close')
        //stream.getTracks().forEach(track => track.stop())
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
    const stream = await getLocalStream({ audio: true, video: false }) // disable video for example
    const peer = createPub()
    const ws = connectWs()

    setPub(prev => ({ ...prev, peer, ws, wsInited: true, stream }))
  }

  function callPeer(id, peerName) {
    if (!pub.peer) {
      console.error('Peer not ready', pub)
      return
    }
    const call = pub.peer.call(id, pub.stream, { metadata: { from: name } })
    if (!call) {
      console.error(`call failed for ${id} from ${pub.peer.id}`)
      return
    }
    let count = 0 // every tracks will emit one stream event, so when both audio & video publish we will get two stream events
    //let _monitor
    call.on('stream', () => {
      // We only need to setRemoteStream once
      if (count > 0) return
      count++

      //_monitor = setInterval(() => {
      //  const setting = stream.getVideoTracks()[0]?.getSettings()
      //  setting && setStatus({ height: setting.height, width: setting.width, fps: setting.frameRate, bitrate: 0 })
      //}, 1000)
      setPeers(prev => [...prev, { peer: call, name: peerName }])
    })
    call.on('close', () => {
      //_monitor && clearInterval(_monitor)
      setPeers(prev => prev.filter(i => i.peer.id !== call.peer.id))
    })
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
    pub.peer && pub.peer.disconnect()
    pub.ws && pub.ws.disconnect()
    peers.forEach(peer => peer.peer.close())
    setPub({ peer: null, ws: null, wsInited: false,stream: null })
    setPeers([])
  }

  function toggleAudio() {
    console.log('toggle audio',pub.stream.getAudioTracks()[0].enabled)
    pub.stream.getAudioTracks()[0].enabled = !pub.stream.getAudioTracks()[0].enabled
    setPub({ ...pub })
  }

  return (
    <main id="buttons" className="container">
      <div className="grid">
        <label htmlFor="name">Name
          <input id="name" type="text" name="name" disabled={pub.peer !== null} value={name} onChange={e => setName(e.target.value)} required />
        </label>
        <label htmlFor="room">Room
          <input id="room" type="text" name="room" disabled={pub.peer !== null} value={room} onChange={e => setRoom(e.target.value)} required />
        </label>
      </div>
      <h4>id: {pub.peer ? pub.peer.id : 'not connected'}</h4>
      <form>
        <a href="#" role="button" onClick={e => {
          e.preventDefault()
          toggleAudio()
        }}>
          {pub.stream?.getAudioTracks()[0]?.enabled ? 'Mute mic' : 'Unmute mic'}</a>
        <a href="#" role="button" onClick={e => {
          e.preventDefault()
          connectToRoom()
        }} disabled={pub.peer !== null}>Connect</a>
        <a href="#" role="button" disabled={pub.peer === null} onClick={(e) => {
          e.preventDefault()
          disconnect()
        }}>Disconnect</a>
      </form>
      <div>
      <form>
        <a href="#" role="button" onClick={(e) => {
          e.preventDefault()
          setIsMute(!isMute)}}>{isMute ? 'Unmute Peer' : 'Mute Peer'}</a>
      </form>
      </div>
      <div className="grid">
        {peers.map((p, i) => {
          console.log(p.peer.remoteStream)
          return (
            <div key={i} className="card">
              { /* name for caller, from for answerer */ }
              <div>{ p.name || p.peer.metadata.from } / {p.peer.peer} </div>
              {<ReactPlayer url={p.peer.remoteStream} playing={true} muted={isMute} />}
            </div>
          )
        })}
      </div>
    </main>
  )
}

export default App
