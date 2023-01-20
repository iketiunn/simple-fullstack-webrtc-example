import { useEffect, useState } from 'react'
import ReactPlayer from 'react-player'
import { Peer } from 'peerjs'

const config = {
  iceServers: [
    //{ urls: 'stun:stun.l.google.com:19302' },
    //{ urls: 'turn:0.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' }
  ]
}
const getLocalStream = async () => {
  // For now, we can't send blank video from user media
  // https://github.com/peers/peerjs/issues/944
  const userStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  
  const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 })
  canvas.getContext('2d').fillRect(0, 0, 320, 240)
  const blankStream = canvas.captureStream()
  blankStream.addTrack(userStream.getAudioTracks()[0])

  return blankStream
};

const peerjsServer = 'localhost'
const createPub = () => new Peer({ host: peerjsServer, secure: false, path: '/', port: 9000 ,config, debug: 0 })

function App() {
  const [localStream, setLocalStream] = useState(null)
  const [callId, setCallId] = useState('')
  const [peers, setPeers] = useState([])
  const [remoteStream, setRemoteStream] = useState(null)
  const [pub, setPub] = useState(null)
  const [sub, setSub] = useState(null)
  const [id, setId] = useState('Not connected')
  const [status, setStatus] = useState({ width: 0, height: 0, fps: 0, bitrate: 0 })
  const [isMute, setIsMute] = useState(true)

  async function fetchPeers(init) {
    const peers = await fetch(`http://${peerjsServer}:9000/peerjs/peers`).then(res => res.json())
    setPeers(peers)
    init && setCallId(peers[peers.length - 1])
  }

  useEffect(() => {
    connect()
    fetchPeers(true)
    const interval = setInterval(() => {
      fetchPeers(false)
    }, 3000);
    return () => {
      clearInterval(interval);
      console.log('clear status')
    }
  }, []);

  function connect() {
    getLocalStream().then((stream) => {
      setLocalStream(stream);

      const peer = createPub()
      peer.on('open', id => {
        setId(id)
      })
      peer.on('call', call => {
        call.answer(localStream)
        call.on('stream', remoteStream => {
          setRemoteStream(remoteStream)
        })
        call.on('close', () => {
          setRemoteStream(null)
          sub && sub.close()
          pub && pub.disconnect()
          setPub(null)
          setSub(null)
          setId('Not connected')
          setRemoteStream(null)
        })
      })
      peer.on('connection', conn => {
        console.log('connection', conn)
      })
      setPub(peer)
    });
  }

  function callToPeer(id) {
    console.log('call to peer', id)
    const call = pub.call(id, localStream)
    let count = 0 // every tracks will emit one stream event, so when both audio & video publish we will get two stream events
    let _monitor
    call.on('stream', (stream) => {
      // We only need to setRemoteStream once
      if (count > 0) return
      count++

      _monitor = setInterval(() => {
        const setting = stream.getVideoTracks()[0]?.getSettings()
        setting && setStatus({ height: setting.height, width: setting.width, fps: setting.frameRate, bitrate: 0 })
      }, 1000)
      setRemoteStream(stream)
    })
    call.on('close', () => {
      _monitor && clearInterval(_monitor)
      setRemoteStream(null)
    })
    setSub(call)
  }

  function disconnect() {
    console.log('Disconnect')
    sub && sub.close()
    pub && pub.disconnect()
    setPub(null)
    setSub(null)
    setId('Not connected')
    setRemoteStream(null)
    setLocalStream(null)
    connect()
  }

  function toggleAudio() {
    console.log('toggle audio',localStream.getAudioTracks()[0].enabled)
    localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled
  }

  return (
    <main id="buttons" className="container">
      <h2>Current id: {id}</h2>
      <form>
        <a href="#" role="button" onClick={e => {
          e.preventDefault()
          toggleAudio()
        }}>
          {localStream?.getAudioTracks()[0]?.enabled ? 'Mute mic' : 'Unmute mic'}</a>
        <a href="#" role="button" onClick={e => {
          e.preventDefault()
          connect()
        }} disabled={pub !== null}>Connect</a>
      </form>
      <div>
        <select valeu={callId} onChange={e => { setCallId(e.target.value)}}>
          {peers && peers.map(peer => <option key={peer} value={peer}>{peer}</option>)}
        </select>
      <form>
        <a href="#" role="button" onClick={(e) => {
          e.preventDefault()
          callToPeer(callId)
        }} disabled={pub === null || sub !== null} >Call Peer</a>
        <a href="#" role="button" onClick={(e) => {
          e.preventDefault()
          disconnect()
        }}>Disconnect Peer</a>
        <a href="#" role="button" onClick={(e) => {
          e.preventDefault()
          setIsMute(!isMute)}}>{isMute ? 'Unmute Peer' : 'Mute Peer'}</a>
      </form>
      { remoteStream && <h2>Remote stream (Peer): {status.width}x{status.height} fps:{status?.fps?.toFixed(2)} </h2> }
      { remoteStream && <ReactPlayer url={remoteStream} width={540} height={960} playing={true} muted={isMute} style={{ transform: 'rotate(90deg)', margin: "0 auto", objectFit: "cover", marginTop: -180 }} /> }
      </div>
    </main>
)
}

export default App
