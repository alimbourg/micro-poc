package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type Response struct {
	Message string `json:"message"`
}

func helloJSON(w http.ResponseWriter, r *http.Request) {
	response := Response{Message: "Hello microservice"}
	w.Header().Set("Content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
func main() {
	log.Print("Running Hello server on 0.0.0.0:8091")
	http.HandleFunc("/hello", helloJSON)
	log.Fatal(http.ListenAndServe("0.0.0.0:8091", nil))

}