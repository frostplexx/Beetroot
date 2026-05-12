// Config parsing logic for beets config.

package beets

import (
	"context"
	"fmt"

	"gopkg.in/yaml.v3"
)

// ParseBeetsConfig parses the beets config which is yaml and returns a map of config keys and values.
func ParseBeetsConfig(ctx context.Context) (map[string]string, string, error) {
	output, err := ExecBeetCommand(ctx, "config")
	if err != nil {
		return nil, output, fmt.Errorf("error executing beets config command: %w", err)
	}

	var configMap map[string]interface{}
	err = yaml.Unmarshal([]byte(output), &configMap)
	if err != nil {
		return nil, output, fmt.Errorf("error parsing beets config output: %w", err)
	}
	
	flatConfig := make(map[string]string)
	flattenConfig("", configMap, flatConfig)
	return flatConfig, output, nil
}

func flattenConfig(prefix string, data map[string]interface{}, result map[string]string) {
	for key, value := range data {
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}

		switch v := value.(type) {
		case map[string]interface{}:
			flattenConfig(fullKey, v, result)
		case []interface{}:
			result[fullKey] = fmt.Sprintf("%v", v)
		default:
			result[fullKey] = fmt.Sprintf("%v", v)
		}
	}
}
