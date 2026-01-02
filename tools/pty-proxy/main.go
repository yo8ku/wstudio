// PTY Proxy - Windows 终端代理工具
// 功能：通过 stdio JSON 协议与 Electron 主进程通信，管理终端进程
// 描述：使用 Windows ConPTY API 实现伪终端功能

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"

	"github.com/UserExistsError/conpty"
)

// 命令类型
type Command struct {
	Type  string `json:"type"`
	Shell string `json:"shell,omitempty"`
	Cwd   string `json:"cwd,omitempty"`
	Data  string `json:"data,omitempty"`
	Cols  int    `json:"cols,omitempty"`
	Rows  int    `json:"rows,omitempty"`
}

// 响应类型
type Response struct {
	Type    string `json:"type"`
	Data    string `json:"data,omitempty"`
	Code    int    `json:"code,omitempty"`
	Success bool   `json:"success,omitempty"`
	Error   string `json:"error,omitempty"`
}

var (
	cpty    *conpty.ConPty
	mu      sync.Mutex
	running bool
)

func main() {
	reader := bufio.NewReader(os.Stdin)

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			continue
		}

		var command Command
		if err := json.Unmarshal([]byte(line), &command); err != nil {
			sendResponse(Response{Type: "error", Error: err.Error()})
			continue
		}

		handleCommand(command)
	}
}

func handleCommand(command Command) {
	switch command.Type {
	case "create":
		createTerminal(command)
	case "write":
		writeToTerminal(command)
	case "resize":
		resizeTerminal(command)
	case "close":
		closeTerminal()
	default:
		sendResponse(Response{Type: "error", Error: "unknown command"})
	}
}

func createTerminal(command Command) {
	mu.Lock()
	defer mu.Unlock()

	if running {
		sendResponse(Response{Type: "error", Error: "terminal already running"})
		return
	}

	shell := command.Shell
	if shell == "" {
		shell = "powershell.exe"
	}

	cols := command.Cols
	rows := command.Rows
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}

	// 设置工作目录
	if command.Cwd != "" {
		os.Chdir(command.Cwd)
	}

	var err error
	cpty, err = conpty.Start(shell, conpty.ConPtyDimensions(cols, rows))
	if err != nil {
		sendResponse(Response{Type: "error", Error: err.Error()})
		return
	}

	running = true
	sendResponse(Response{Type: "created", Success: true})

	// 读取 ConPTY 输出
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := cpty.Read(buf)
			if err != nil {
				break
			}
			if n > 0 {
				sendResponse(Response{Type: "data", Data: string(buf[:n])})
			}
		}

		// 获取退出码
		exitCode, _ := cpty.Wait(context.Background())

		mu.Lock()
		running = false
		cpty = nil
		mu.Unlock()

		sendResponse(Response{Type: "exit", Code: int(exitCode)})
	}()
}

func writeToTerminal(command Command) {
	mu.Lock()
	defer mu.Unlock()

	if !running || cpty == nil {
		return
	}

	cpty.Write([]byte(command.Data))
}

func resizeTerminal(command Command) {
	mu.Lock()
	defer mu.Unlock()

	if !running || cpty == nil {
		return
	}

	if command.Cols > 0 && command.Rows > 0 {
		cpty.Resize(command.Cols, command.Rows)
	}
}

func closeTerminal() {
	mu.Lock()
	defer mu.Unlock()

	if cpty != nil {
		cpty.Close()
		cpty = nil
	}
	running = false

	sendResponse(Response{Type: "closed", Success: true})
}

func sendResponse(resp Response) {
	data, _ := json.Marshal(resp)
	fmt.Println(string(data))
}
