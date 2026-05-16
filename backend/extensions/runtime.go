package extensions

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/dop251/goja"
)

// Runtime manages JavaScript execution for an extension
type Runtime struct {
	vm                *goja.Runtime
	extension         *Extension
	db                *ExtensionDB
	api               *ExtensionAPI
	registeredExtension map[string]interface{} // Stores the registered extension functions
}

// NewRuntime creates a new JavaScript runtime for an extension
func NewRuntime(ext *Extension, db *ExtensionDB) (*Runtime, error) {
	vm := goja.New()

	api := &ExtensionAPI{
		extID:      ext.ID,
		extName:    ext.Name,
		db:         db,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		settings:   ext.Settings,
	}

	rt := &Runtime{
		vm:                  vm,
		extension:           ext,
		db:                  db,
		api:                 api,
		registeredExtension: make(map[string]interface{}),
	}

	// Inject APIs into the VM
	if err := rt.registerAPIs(); err != nil {
		return nil, fmt.Errorf("failed to register APIs: %w", err)
	}

	// Provide registerExtension function for SpotiFLAC extensions
	vm.Set("registerExtension", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) > 0 {
			rt.registeredExtension = call.Arguments[0].Export().(map[string]interface{})
		}
		return goja.Undefined()
	})

	// Load extension script
	if _, err := vm.RunString(ext.ScriptContent); err != nil {
		return nil, fmt.Errorf("failed to load extension script: %w", err)
	}

	return rt, nil
}

// registerAPIs injects the extension APIs into the JavaScript VM
func (rt *Runtime) registerAPIs() error {
	// http API
	httpObj := rt.vm.NewObject()
	httpObj.Set("get", rt.api.HTTPGet)
	httpObj.Set("post", rt.api.HTTPPost)
	httpObj.Set("put", rt.api.HTTPPut)
	httpObj.Set("delete", rt.api.HTTPDelete)
	httpObj.Set("request", rt.api.HTTPRequest)
	rt.vm.Set("http", httpObj)

	// storage API
	storageObj := rt.vm.NewObject()
	storageObj.Set("get", rt.api.StorageGet)
	storageObj.Set("set", rt.api.StorageSet)
	storageObj.Set("delete", rt.api.StorageDelete)
	rt.vm.Set("storage", storageObj)

	// console API
	consoleObj := rt.vm.NewObject()
	consoleObj.Set("log", rt.api.ConsoleLog)
	consoleObj.Set("info", rt.api.ConsoleLog)
	consoleObj.Set("warn", rt.api.ConsoleWarn)
	consoleObj.Set("error", rt.api.ConsoleError)
	consoleObj.Set("debug", rt.api.ConsoleLog)
	rt.vm.Set("console", consoleObj)

	// log API (alias for console, used by SpotiFLAC extensions)
	logObj := rt.vm.NewObject()
	logObj.Set("log", rt.api.ConsoleLog)
	logObj.Set("info", rt.api.ConsoleLog)
	logObj.Set("warn", rt.api.ConsoleWarn)
	logObj.Set("error", rt.api.ConsoleError)
	logObj.Set("debug", rt.api.ConsoleLog)
	rt.vm.Set("log", logObj)

	// settings API
	settingsObj := rt.vm.NewObject()
	settingsObj.Set("get", rt.api.SettingsGet)
	rt.vm.Set("settings", settingsObj)

	// utils API (for SpotiFLAC extensions)
	utilsObj := rt.vm.NewObject()
	utilsObj.Set("appUserAgent", rt.api.AppUserAgent)
	utilsObj.Set("randomUserAgent", rt.api.RandomUserAgent)
	utilsObj.Set("base64Encode", rt.api.Base64Encode)
	utilsObj.Set("base64Decode", rt.api.Base64Decode)
	utilsObj.Set("hexEncode", rt.api.HexEncode)
	utilsObj.Set("hexDecode", rt.api.HexDecode)
	rt.vm.Set("utils", utilsObj)

	// CryptoJS API (for SpotiFLAC extensions that use crypto)
	cryptoObj := rt.vm.NewObject()

	// Create HmacSHA1 function that returns an object with toString method
	cryptoObj.Set("HmacSHA1", func(message, key string) map[string]interface{} {
		hash := rt.api.HmacSHA1(message, key)
		return map[string]interface{}{
			"toString": func() string { return hash },
		}
	})

	cryptoObj.Set("HmacSHA256", func(message, key string) map[string]interface{} {
		hash := rt.api.HmacSHA256(message, key)
		return map[string]interface{}{
			"toString": func() string { return hash },
		}
	})

	cryptoObj.Set("MD5", func(message string) map[string]interface{} {
		hash := rt.api.MD5(message)
		return map[string]interface{}{
			"toString": func() string { return hash },
		}
	})

	cryptoObj.Set("SHA1", func(message string) map[string]interface{} {
		hash := rt.api.SHA1(message)
		return map[string]interface{}{
			"toString": func() string { return hash },
		}
	})

	cryptoObj.Set("SHA256", func(message string) map[string]interface{} {
		hash := rt.api.SHA256(message)
		return map[string]interface{}{
			"toString": func() string { return hash },
		}
	})

	// Create enc object for encoding
	encObj := rt.vm.NewObject()
	encObj.Set("Base64", map[string]interface{}{
		"stringify": rt.api.Base64Encode,
		"parse":     rt.api.Base64Decode,
	})
	encObj.Set("Hex", map[string]interface{}{
		"stringify": rt.api.HexEncode,
		"parse":     rt.api.HexDecode,
	})
	cryptoObj.Set("enc", encObj)

	rt.vm.Set("CryptoJS", cryptoObj)

	// Global functions
	rt.vm.Set("fetch", rt.api.Fetch) // Browser-compatible fetch
	rt.vm.Set("atob", rt.api.Base64Decode) // Browser base64 decode
	rt.vm.Set("btoa", rt.api.Base64Encode) // Browser base64 encode

	return nil
}

// Execute calls a function in the extension with a timeout
func (rt *Runtime) Execute(ctx context.Context, functionName string, args ...interface{}) (interface{}, error) {
	// Create timeout context
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Channel for result
	resultChan := make(chan interface{}, 1)
	errChan := make(chan error, 1)

	// Execute in goroutine
	go func() {
		defer func() {
			if r := recover(); r != nil {
				errChan <- fmt.Errorf("extension panic: %v", r)
			}
		}()

		// Get function from VM
		fn, ok := goja.AssertFunction(rt.vm.Get(functionName))
		if !ok {
			errChan <- fmt.Errorf("function %s not found or not callable", functionName)
			return
		}

		// Convert args to goja values
		gojaArgs := make([]goja.Value, len(args))
		for i, arg := range args {
			gojaArgs[i] = rt.vm.ToValue(arg)
		}

		// Call function
		result, err := fn(goja.Undefined(), gojaArgs...)
		if err != nil {
			errChan <- err
			return
		}

		resultChan <- result.Export()
	}()

	// Wait for result or timeout
	select {
	case result := <-resultChan:
		return result, nil
	case err := <-errChan:
		return nil, err
	case <-ctx.Done():
		return nil, fmt.Errorf("extension timeout after 30 seconds")
	}
}

// ExecuteSearch calls the search function in the extension
func (rt *Runtime) ExecuteSearch(ctx context.Context, query string, options map[string]interface{}) ([]map[string]interface{}, error) {
	// SpotiFLAC extensions use 'customSearch', fallback to 'search'
	functionName := "customSearch"
	if rt.registeredExtension != nil {
		if _, ok := rt.registeredExtension[functionName]; !ok {
			functionName = "search"
		}
	} else {
		functionName = "search"
	}

	result, err := rt.Execute(ctx, functionName, query, options)
	if err != nil {
		return nil, err
	}

	// Convert result to slice of maps
	results, ok := result.([]interface{})
	if !ok {
		return nil, fmt.Errorf("search returned invalid type: expected array, got %T", result)
	}

	searchResults := make([]map[string]interface{}, 0, len(results))
	for _, r := range results {
		resultMap, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		searchResults = append(searchResults, resultMap)
	}

	return searchResults, nil
}

// ExecuteDownload calls the download function in the extension
func (rt *Runtime) ExecuteDownload(ctx context.Context, url string, options map[string]interface{}) (map[string]interface{}, error) {
	result, err := rt.Execute(ctx, "download", url, options)
	if err != nil {
		return nil, err
	}

	resultMap, ok := result.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("download returned invalid type: expected object, got %T", result)
	}

	return resultMap, nil
}

// ExecuteInitialize calls the initialize function in the extension
func (rt *Runtime) ExecuteInitialize(ctx context.Context) error {
	_, err := rt.Execute(ctx, "initialize", rt.extension.Settings)
	return err
}

// ExecuteCleanup calls the cleanup function in the extension
func (rt *Runtime) ExecuteCleanup(ctx context.Context) error {
	_, err := rt.Execute(ctx, "cleanup")
	return err
}

// ToJSON converts a goja value to JSON string
func ToJSON(v interface{}) (string, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// FromJSON parses JSON string to interface{}
func FromJSON(s string) (interface{}, error) {
	var v interface{}
	err := json.Unmarshal([]byte(s), &v)
	return v, err
}
