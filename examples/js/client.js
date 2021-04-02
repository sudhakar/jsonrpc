const { WSRPC, WSClientTransport } = require('../../js/index.js')

async function main() {
  const transport = new WSClientTransport(
    'ws://localhost:8080/ws',
    async () => {
      console.log('connected')
    },
  )

  const rpc = new WSRPC(transport)

  transport.connect()

  rpc.register('Peer.SayHello', async msg => {
    console.log('recv: ', msg)
    // throw new Error('llool')
    // return 'llool'
  })

  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 50))
    // console.log('chat resp', await rpc.call('Chat.Message', { From: `Tom ${i}`, Message: 'hello!' }))
    rpc.notify('Chat.Message', { From: `Tom ${i}`, Message: 'hello!' })
  }

  transport.close()
}

main().catch(console.error)
