const http = require('http')
const url = require('url')
const { Server } = require('socket.io')
const express = require('express')
const cors = require('cors')
const peer = require('peer')

const PORT = 9000
const expressApp = express().use(cors())
const expressServer = http.Server(expressApp)
const socketServer = new Server(expressServer, { path: '/ws', cors: { origin: '*' } })
const peerServer = peer.ExpressPeerServer(expressServer)
const peers = {}
const rooms = {}

expressApp.use('/peer', peerServer)
expressApp.get('/rooms/:id', (req, res) => {
  const roomId = req.params.id
  if (rooms[roomId]) {
    res.json(rooms[roomId])
  } else {
    res.status(404).send('Room not found')
  }
})
socketServer.on('connection', socket => {
  socket.on('join', ({ room: roomId, peerId, name }) => {
    console.log('join', roomId, peerId, name)
    socket.join(roomId)
    const room = rooms[roomId] || (rooms[roomId] = {})
    room[peerId] = { name }
    peers[socket.id] = { roomId, peerId }
    socketServer.to(roomId).emit(`room:${roomId}:join`, { peerId, name })
  })
  socket.on('disconnect', () => {
    const { roomId, peerId } = peers[socket.id] || {}
    if (!roomId || !peerId) return
    console.log('leave', roomId, peerId)
    delete peers[socket.id]
    delete rooms[roomId][peerId]
    socketServer.to(roomId).emit(`room:${roomId}:leave`, { peerId })
  })
})

// mutiple ws doesn't play well in one http server
// https://stackoverflow.com/a/53181977/8809062
const [socketioUpgradeListener, peerjsUpgradeListener] = expressServer.listeners('upgrade').splice(0);
expressServer.removeAllListeners('upgrade');
expressServer.on('upgrade', (req, socket, head) => {
  const pathname = url.parse(req.url).pathname;
  if (pathname == '/ws/')
    socketioUpgradeListener(req, socket, head);
  else if (pathname == '/peer/peerjs')
    peerjsUpgradeListener(req, socket, head);
  else
    socket.destroy();
});

expressServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
