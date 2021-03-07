import { WSRPC } from '../../js/index.js'

const rpc = new WSRPC('ws://localhost:8080/ws', async () => {
  console.log('connected')

  // console.log('chat resp', await rpc.call('Chat.Notify', { From: `Tom Notify`, Message: 'hello!' }))
  // await new Promise(r => setTimeout(r, 500))
  // console.log('chat resp', await rpc.call('Chat.Notify', { From: `Tom Notify`, Message: 'hello!' }))
})

rpc.register('Peer.SayHello', async msg => {
  console.log('recv: ', msg)
  // throw new Error('llool')
  return 'llool'
})

// for (let i = 0; i < 1000; i++) {
//   await new Promise(r => setTimeout(r, 500))
//   // console.log('chat resp', await rpc.call('Chat.Message', { From: `Tom ${i}`, Message: 'hello!' }))
//   rpc.notify('Chat.Message', { From: `Tom ${i}`, Message: 'hello!' })
// }
