package main

import (
	"fmt"
	"sqlformys/internal/config"
)

func main() {
	cfg := config.Load()
	fmt.Printf("PORT: %s\n", cfg.Port)
	fmt.Printf("DB_DRIVER: %s\n", cfg.DBDriver)
	fmt.Printf("DB_DSN: %s\n", cfg.DBDsn)
}
