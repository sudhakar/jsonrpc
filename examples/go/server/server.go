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

func main() {
	flag.Parse()
	log.SetFlags(log.Lmicroseconds)

	chat := Chat{}
	registry := jsonrpc.NewRegistry().RegisterService(&chat)

	upgrader := websocket.Upgrader{}
	serve := func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)

		if err != nil {
			log.Print("upgrade:", err)
			return
		}

		endpoint := jsonrpc.NewEndpoint(conn, registry)

		go endpoint.Serve()
		var reply interface{}

		if err = endpoint.Call("Peer.SayHello", &data.Incoming{From: "Tom", Message: "hello!"}, &reply); err != nil {
			log.Fatal("Call:", err)
		} else {
			log.Print("recv msg: ", reply)
		}

	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("test!"))
	})

	http.HandleFunc("/ws", serve)

	log.Printf("serve at %s", *serveAddr)

	err := http.ListenAndServe(*serveAddr, nil)
	if err != nil {
		log.Fatal(err)
	}

}
