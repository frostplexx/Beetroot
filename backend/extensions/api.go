package extensions

import (
	"bytes"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

// ExtensionAPI provides APIs for extensions to use
type ExtensionAPI struct {
	extID      int64
	extName    string
	db         *ExtensionDB
	httpClient *http.Client
	settings   map[string]interface{}
}

// HTTPResponse represents an HTTP response for extensions
type HTTPResponse struct {
	OK         bool                `json:"ok"`
	StatusCode int                 `json:"statusCode"`
	Status     int                 `json:"status"` // Alias for statusCode
	Body       string              `json:"body"`
	Headers    map[string][]string `json:"headers"`
}

// HTTPGet performs an HTTP GET request
func (api *ExtensionAPI) HTTPGet(url string, options map[string]interface{}) map[string]interface{} {
	return api.httpRequest("GET", url, nil, options)
}

// HTTPPost performs an HTTP POST request
func (api *ExtensionAPI) HTTPPost(url string, body interface{}, options map[string]interface{}) map[string]interface{} {
	return api.httpRequest("POST", url, body, options)
}

// HTTPPut performs an HTTP PUT request
func (api *ExtensionAPI) HTTPPut(url string, body interface{}, options map[string]interface{}) map[string]interface{} {
	return api.httpRequest("PUT", url, body, options)
}

// HTTPDelete performs an HTTP DELETE request
func (api *ExtensionAPI) HTTPDelete(url string, options map[string]interface{}) map[string]interface{} {
	return api.httpRequest("DELETE", url, nil, options)
}

// HTTPRequest performs a generic HTTP request
func (api *ExtensionAPI) HTTPRequest(options map[string]interface{}) map[string]interface{} {
	method, _ := options["method"].(string)
	if method == "" {
		method = "GET"
	}

	url, _ := options["url"].(string)
	if url == "" {
		return api.errorResponse("url is required")
	}

	body := options["body"]
	return api.httpRequest(method, url, body, options)
}

// Fetch provides browser-compatible fetch API
func (api *ExtensionAPI) Fetch(url string, options map[string]interface{}) map[string]interface{} {
	method := "GET"
	var body interface{}

	if options != nil {
		if m, ok := options["method"].(string); ok {
			method = m
		}
		body = options["body"]
	}

	response := api.httpRequest(method, url, body, options)

	// Add browser-compatible methods
	response["text"] = func() string {
		if bodyStr, ok := response["body"].(string); ok {
			return bodyStr
		}
		return ""
	}

	response["json"] = func() interface{} {
		bodyStr, ok := response["body"].(string)
		if !ok {
			return nil
		}
		var result interface{}
		json.Unmarshal([]byte(bodyStr), &result)
		return result
	}

	return response
}

// httpRequest performs the actual HTTP request
func (api *ExtensionAPI) httpRequest(method, url string, body interface{}, options map[string]interface{}) map[string]interface{} {
	// Prepare request body
	var bodyReader io.Reader
	if body != nil {
		// If body is a string, use it directly
		if bodyStr, ok := body.(string); ok {
			bodyReader = strings.NewReader(bodyStr)
		} else {
			// Otherwise, marshal to JSON
			bodyJSON, err := json.Marshal(body)
			if err != nil {
				return api.errorResponse(fmt.Sprintf("failed to marshal body: %v", err))
			}
			bodyReader = bytes.NewReader(bodyJSON)
		}
	}

	// Create request
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return api.errorResponse(fmt.Sprintf("failed to create request: %v", err))
	}

	// Set headers
	if options != nil {
		if headers, ok := options["headers"].(map[string]interface{}); ok {
			for key, value := range headers {
				if valueStr, ok := value.(string); ok {
					req.Header.Set(key, valueStr)
				}
			}
		}
	}

	// Set default Content-Type for POST/PUT with JSON body
	if (method == "POST" || method == "PUT") && body != nil && req.Header.Get("Content-Type") == "" {
		if _, ok := body.(string); !ok {
			req.Header.Set("Content-Type", "application/json")
		}
	}

	// Perform request
	resp, err := api.httpClient.Do(req)
	if err != nil {
		return api.errorResponse(fmt.Sprintf("request failed: %v", err))
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return api.errorResponse(fmt.Sprintf("failed to read response: %v", err))
	}

	// Build response object
	return map[string]interface{}{
		"ok":         resp.StatusCode >= 200 && resp.StatusCode < 300,
		"statusCode": resp.StatusCode,
		"status":     resp.StatusCode,
		"body":       string(respBody),
		"headers":    resp.Header,
	}
}

// errorResponse creates an error response
func (api *ExtensionAPI) errorResponse(message string) map[string]interface{} {
	return map[string]interface{}{
		"ok":         false,
		"statusCode": 0,
		"status":     0,
		"body":       "",
		"error":      message,
	}
}

// StorageGet retrieves a value from storage
func (api *ExtensionAPI) StorageGet(key string) string {
	value, err := api.db.GetStorage(api.extID, key)
	if err != nil {
		log.Printf("[%s] Storage get error: %v", api.extName, err)
		return ""
	}
	return value
}

// StorageSet sets a value in storage
func (api *ExtensionAPI) StorageSet(key string, value interface{}) error {
	// Convert value to string
	var valueStr string
	switch v := value.(type) {
	case string:
		valueStr = v
	case int, int64, float64, bool:
		valueStr = fmt.Sprintf("%v", v)
	default:
		// Marshal complex types to JSON
		jsonData, err := json.Marshal(v)
		if err != nil {
			return fmt.Errorf("failed to marshal value: %w", err)
		}
		valueStr = string(jsonData)
	}

	return api.db.SetStorage(api.extID, key, valueStr)
}

// StorageDelete deletes a key from storage
func (api *ExtensionAPI) StorageDelete(key string) error {
	return api.db.DeleteStorage(api.extID, key)
}

// ConsoleLog logs a message
func (api *ExtensionAPI) ConsoleLog(args ...interface{}) {
	message := api.formatLogMessage(args...)
	log.Printf("[%s] %s", api.extName, message)
}

// ConsoleWarn logs a warning
func (api *ExtensionAPI) ConsoleWarn(args ...interface{}) {
	message := api.formatLogMessage(args...)
	log.Printf("[%s] WARN: %s", api.extName, message)
}

// ConsoleError logs an error
func (api *ExtensionAPI) ConsoleError(args ...interface{}) {
	message := api.formatLogMessage(args...)
	log.Printf("[%s] ERROR: %s", api.extName, message)
}

// formatLogMessage formats log arguments into a string
func (api *ExtensionAPI) formatLogMessage(args ...interface{}) string {
	parts := make([]string, len(args))
	for i, arg := range args {
		switch v := arg.(type) {
		case string:
			parts[i] = v
		case int, int64, float64, bool:
			parts[i] = fmt.Sprintf("%v", v)
		default:
			// Try to marshal to JSON for complex types
			jsonData, err := json.Marshal(v)
			if err != nil {
				parts[i] = fmt.Sprintf("%v", v)
			} else {
				parts[i] = string(jsonData)
			}
		}
	}
	return strings.Join(parts, " ")
}

// SettingsGet retrieves a setting value
func (api *ExtensionAPI) SettingsGet(key string) interface{} {
	if value, ok := api.settings[key]; ok {
		return value
	}
	return nil
}

// AppUserAgent returns a user agent string for the app
func (api *ExtensionAPI) AppUserAgent() string {
	return "Beetroot/1.0 (Music Library Manager)"
}

// RandomUserAgent returns a random browser user agent
func (api *ExtensionAPI) RandomUserAgent() string {
	userAgents := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
	}
	// For now, return the first one (could add randomization later)
	return userAgents[0]
}

// HmacSHA1 computes HMAC-SHA1
func (api *ExtensionAPI) HmacSHA1(message, key string) string {
	h := hmac.New(sha1.New, []byte(key))
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

// HmacSHA256 computes HMAC-SHA256
func (api *ExtensionAPI) HmacSHA256(message, key string) string {
	h := hmac.New(sha256.New, []byte(key))
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

// MD5 computes MD5 hash
func (api *ExtensionAPI) MD5(message string) string {
	h := md5.New()
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

// SHA1 computes SHA1 hash
func (api *ExtensionAPI) SHA1(message string) string {
	h := sha1.New()
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

// SHA256 computes SHA256 hash
func (api *ExtensionAPI) SHA256(message string) string {
	h := sha256.New()
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

// Base64Encode encodes a string to base64
func (api *ExtensionAPI) Base64Encode(str string) string {
	return base64.StdEncoding.EncodeToString([]byte(str))
}

// Base64Decode decodes a base64 string
func (api *ExtensionAPI) Base64Decode(str string) string {
	decoded, err := base64.StdEncoding.DecodeString(str)
	if err != nil {
		return ""
	}
	return string(decoded)
}

// HexEncode encodes bytes to hex string
func (api *ExtensionAPI) HexEncode(str string) string {
	return hex.EncodeToString([]byte(str))
}

// HexDecode decodes hex string to bytes
func (api *ExtensionAPI) HexDecode(str string) string {
	decoded, err := hex.DecodeString(str)
	if err != nil {
		return ""
	}
	return string(decoded)
}
