/* The "World" microservice exposes a /world API endpoint and returns a simple JSON message: */
package main

import (
	"encoding/json"
	"log"
	"net/http"
	// go install github.com/hashicorp/consul/api@latest
	// go install github.com/hashicorp/consul/connect@latest
	"github.com/hashicorp/consul/api"
  	"github.com/hashicorp/consul/connect"
)

type MyResponse struct {
	Message string `json:"message"`
}

func helloJSON(w http.ResponseWriter, r *http.Request) {
	response := MyResponse{Message: "World microservice"}
	w.Header().Set("Content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func main() {
	// CONSUL part: https://www.consul.io/docs/connect/native/go
	// Create a Consul API client	
	client, _ := api.NewClient(api.DefaultConfig())
	// Create an instance representing this service. "my-service" is the
	// name of _this_ service. The service should be cleaned up via Close.
	svc, _ := connect.NewService("ws-world-go", client)
	defer svc.Close()

	log.Print("Running World server on 0.0.0.0:8090")

	// http.HandleFunc("/world", helloJSON)
	// log.Fatal(http.ListenAndServe("0.0.0.0:8090", nil))

	// Creating an HTTP server that serves via Connect
	server := &http.Server{
		Addr:      ":8090",
		TLSConfig: svc.ServerTLSConfig(),
		// ... other standard fields
	}
	// Serve!
	server.ListenAndServeTLS("", "")

}