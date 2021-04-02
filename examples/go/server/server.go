package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/sudhakar/jsonrpc"
	"github.com/sudhakar/jsonrpc/examples/go/data"
)

var serveAddr = flag.String("addr", "0.0.0.0:8080", "http service address")

type Chat struct {
}

func (c *Chat) Message(msg data.Incoming) (*data.Outputting, error) {
	log.Printf("recv: %#v\n", msg)
	reply := data.Outputting{Message: msg.Message + msg.From}
	return &reply, nil
}

func (c *Chat) Notify(msg data.Incoming) {
	log.Printf("recv: %#v\n", msg)
}

func main() {
	flag.Parse()
	log.SetFlags(log.Lmicroseconds)

	chat := Chat{}
	registry := jsonrpc.NewRegistry().RegisterService(&chat)
	upgrader := websocket.Upgrader{}

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)

		if err != nil {
			log.Print("upgrade:", err)
			return
		}

		endpoint := jsonrpc.NewEndpoint(conn, registry)

		go func() {
			if err := endpoint.Serve(); err != nil {
				log.Println(err)
			}
		}()

		// time.Sleep(5 * time.Second)

		reply := struct{}{}

		err = endpoint.Call("Peer.SayHello", &data.Incoming{From: "Sudhh", Message: "hello!"}, nil)

		if err != nil {
			log.Println(err)
		}

		log.Println("reply", reply)

		// time.Sleep(5 * time.Second)
		// endpoint.Notify("Peer.SayHello", &data.Incoming{From: "Satan", Message: "hello!"})
	})

	log.Printf("serve at %s", *serveAddr)
	if err := http.ListenAndServe(*serveAddr, nil); err != nil {
		log.Fatal(err)
	}
}
