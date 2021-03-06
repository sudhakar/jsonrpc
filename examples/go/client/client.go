package main

import (
	"flag"
	"log"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/websocket"

	"github.com/sudhakar/jsonrpc"
	"github.com/sudhakar/jsonrpc/examples/go/data"
)

var addr = flag.String("addr", "localhost:8080", "http service address")

type Peer struct {
}

func (c *Peer) SayHello(msg data.Incoming) (*data.Outputting, error) {
	log.Printf("recv: %#v\n", msg)
	reply := data.Outputting{Message: "worlD!!!!" + msg.From}
	return &reply, nil
}

func main() {

	flag.Parse()
	log.SetFlags(log.Lmicroseconds)

	u := url.URL{Scheme: "ws", Host: *addr, Path: "/ws"}
	log.Printf("connecting to %s", u.String())
	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)

	if err != nil {
		log.Fatal("NewClient:", err)
	}

	peer := Peer{}
	registry := jsonrpc.NewRegistry().RegisterService(&peer)
	endpoint := jsonrpc.NewEndpoint(conn, registry)
	go endpoint.Serve()

	defer endpoint.Close()

	var reply interface{}
	start := time.Now()

	for i := 0; i < 1; i++ {
		if err = endpoint.Call("Chat.Message", &data.Incoming{From: "Tom", Message: "hello!"}, &reply); err != nil {
			log.Fatal("Call:", err)
		} else {
			log.Print("recv msg: ", reply)
		}
	}

	log.Print("Elapsed: ", time.Since(start))

	ctrlC := make(chan os.Signal, 1)
	// catch SIGETRM or SIGINTERRUPT
	signal.Notify(ctrlC, syscall.SIGTERM, syscall.SIGINT)

	<-ctrlC

}
