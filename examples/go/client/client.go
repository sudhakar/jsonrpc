package main

import (
	"flag"
	"log"
	"net/url"
	"time"

	"github.com/sudhakar/jsonrpc"
	"github.com/sudhakar/jsonrpc/examples/go/data"
)

var addr = flag.String("addr", "localhost:8080", "http service address")

func main() {

	flag.Parse()
	log.SetFlags(log.Lmicroseconds)

	u := url.URL{Scheme: "ws", Host: *addr, Path: "/ws"}
	log.Printf("connecting to %s", u.String())

	endpoint, err := jsonrpc.NewClient(u.String(), nil)

	if err != nil {
		log.Fatal("NewClient:", err)
	}

	defer endpoint.Close()

	var reply data.Outputting

	start := time.Now()

	for i := 0; i < 1; i++ {
		if err = endpoint.Call("Chat.Message", &data.Incoming{From: "Tom", Message: "hello!"}, &reply); err != nil {
			log.Fatal("Call:", err)
		} else {
			log.Print("recv msg:", reply.Message)
		}
	}

	log.Print("Elapsed: ", time.Since(start))

}
