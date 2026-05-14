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
	return ExecBeetCommandWithFlags(ctx, nil, command, args...)
}

// ExecBeetCommandWithFlags executes a beets command with optional global flags (e.g., -v for verbose)
func ExecBeetCommandWithFlags(ctx context.Context, globalFlags []string, command string, args ...string) (string, error) {
	beetBinPath := os.Getenv("BEET_BIN_PATH")
	if beetBinPath == "" {
		beetBinPath = "beet"
	}

	// Build command: beet [global flags] command [args]
	cmdArgs := []string{}
	if len(globalFlags) > 0 {
		cmdArgs = append(cmdArgs, globalFlags...)
	}
	cmdArgs = append(cmdArgs, command)
	cmdArgs = append(cmdArgs, args...)

	cmd := exec.CommandContext(ctx, beetBinPath, cmdArgs...)
	if workingDir := os.Getenv("BEET_WORKING_DIR"); workingDir != "" {
		cmd.Dir = workingDir
	}

	log.Debug().Str("command", command).Strs("globalFlags", globalFlags).Strs("args", args).Msg("Executing beets command")

	outputBytes, err := cmd.CombinedOutput()
	output := string(outputBytes)
	if err != nil {
		log.Error().Err(err).Str("output", output).Msg("Error executing beets command")
		return output, fmt.Errorf("error executing beets command: %w", err)
	}

	log.Debug().Str("output", output).Msg("Beets command executed successfully")
	return strings.TrimSpace(output), nil
}
