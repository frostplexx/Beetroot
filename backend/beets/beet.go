// Main harness around beets binary

package beets

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/rs/zerolog/log"
)

const (
	CommandAdd    = "add"
	CommandImport = "import"
	CommandList   = "list"
	CommandMove   = "move"
	CommandRemove = "remove"
	CommandUpdate = "update"
	CommandWrite  = "write"
	CommandConfig = "config"
)

// Execute beets binary.
// Binary path gets fetched from environment variable BEET_BIN_PATH, if not set, it defaults to "beet".
// function takes command which is part of enum and arguments which are passed to beets binary.
func ExecBeetCommand(ctx context.Context, command string, args ...string) (string, error) {
	beetBinPath := os.Getenv("BEET_BIN_PATH")
	if beetBinPath == "" {
		beetBinPath = "beet"
	}

	cmdArgs := append([]string{command}, args...)
	cmd := exec.CommandContext(ctx, beetBinPath, cmdArgs...)
	if workingDir := os.Getenv("BEET_WORKING_DIR"); workingDir != "" {
		cmd.Dir = workingDir
	}

	log.Debug().Str("command", command).Strs("args", args).Msg("Executing beets command")

	outputBytes, err := cmd.CombinedOutput()
	output := string(outputBytes)
	if err != nil {
		log.Error().Err(err).Str("output", output).Msg("Error executing beets command")
		return output, fmt.Errorf("error executing beets command: %w", err)
	}

	log.Debug().Str("output", output).Msg("Beets command executed successfully")
	return strings.TrimSpace(output), nil
}
