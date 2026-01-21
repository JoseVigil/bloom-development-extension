package ui

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sentinel/internal/core"
	"strings"
	"sync"
	"time"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
)

// CockpitV2 representa la estación de monitoreo de grado industrial
type CockpitV2 struct {
	App           *tview.Application
	MainLayout    *tview.Flex
	Panels        map[string]*tview.TextView
	activeTails   map[string]chan bool // Canales para detener goroutines de tailing
	TelemetryPath string
	mu            sync.Mutex
}

func NewCockpitV2(path string) *CockpitV2 {
	return &CockpitV2{
		App:           tview.NewApplication(),
		MainLayout:    tview.NewFlex().SetDirection(tview.FlexRow),
		Panels:        make(map[string]*tview.TextView),
		activeTails:   make(map[string]chan bool),
		TelemetryPath: path,
	}
}

// Run inicia la aplicación y el loop de eventos
func (c *CockpitV2) Run() error {
	// Configurar atajos globales
	c.App.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		if event.Key() == tcell.KeyCtrlC || event.Rune() == 'q' {
			c.App.Stop()
		}
		if event.Rune() == 'c' {
			for _, tv := range c.Panels {
				tv.Clear()
			}
		}
		return event
	})

	// Iniciar monitoreo del JSON de telemetría
	c.watchTelemetry()

	return c.App.SetRoot(c.MainLayout, true).EnableMouse(true).Run()
}

// watchTelemetry observa cambios en el archivo de estado global
func (c *CockpitV2) watchTelemetry() {
	go func() {
		for {
			data, err := os.ReadFile(c.TelemetryPath)
			if err == nil {
				var tel core.TelemetryData
				if err := json.Unmarshal(data, &tel); err == nil {
					c.App.QueueUpdateDraw(func() {
						c.rebuildLayout(tel)
					})
				}
			}
			time.Sleep(2 * time.Second)
		}
	}()
}

// rebuildLayout construye la UI basándose en las prioridades 75/15/10
func (c *CockpitV2) rebuildLayout(tel core.TelemetryData) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.MainLayout.Clear()

	// Contenedores de filas
	topRow := tview.NewFlex().SetDirection(tview.FlexColumn)    // 75% alto
	bottomRow := tview.NewFlex().SetDirection(tview.FlexColumn) // 15% alto
	
	// Mapa temporal para organizar por prioridad
	slots := make(map[int]*tview.TextView)

	// 1. Limpieza de paneles de procesos que ya no existen
	for id := range c.Panels {
		if _, exists := tel.Streams[id]; !exists {
			if stop, ok := c.activeTails[id]; ok {
				stop <- true
				delete(c.activeTails, id)
			}
			delete(c.Panels, id)
		}
	}

	// 2. Preparar/Actualizar paneles activos
	for id, info := range tel.Streams {
		if !info.Active {
			continue
		}

		tv, exists := c.Panels[id]
		if !exists {
			tv = tview.NewTextView().
				SetDynamicColors(true).
				SetTextAlign(tview.AlignLeft).
				SetWrap(false)
			
			tv.SetBorder(true).SetTitle(fmt.Sprintf(" [yellow]%s ", info.Label))
			
			tv.SetChangedFunc(func() {
				tv.ScrollToEnd()
				c.App.Draw()
			})

			c.Panels[id] = tv
			stopChan := make(chan bool)
			c.activeTails[id] = stopChan
			go c.tailLog(info.Path, id, tv, stopChan)
		}
		
		// Asignar al slot de prioridad (1 a 5)
		if info.Priority >= 1 && info.Priority <= 5 {
			slots[info.Priority] = tv
		}
	}

	// 3. Ensamblaje Geométrico
	
	// FILA SUPERIOR (75%): P1 (3/4 ancho) y P2 (1/4 ancho)
	if p1, ok := slots[1]; ok {
		topRow.AddItem(p1, 0, 3, false)
	} else {
		topRow.AddItem(c.createEmptyBox("P1: WAITING FOR CORE..."), 0, 3, false)
	}

	if p2, ok := slots[2]; ok {
		topRow.AddItem(p2, 0, 1, false)
	} else {
		topRow.AddItem(c.createEmptyBox("P2"), 0, 1, false)
	}

	// FILA INFERIOR (15%): P3, P4, P5
	for i := 3; i <= 5; i++ {
		if p, ok := slots[i]; ok {
			bottomRow.AddItem(p, 0, 1, false)
		} else {
			bottomRow.AddItem(c.createEmptyBox(fmt.Sprintf("P%d", i)), 0, 1, false)
		}
	}
	bottomRow.AddItem(tview.NewBox().SetBorder(true), 0, 1, false) // Espacio de reserva

	// Agregar al layout principal con pesos de altura
	c.MainLayout.AddItem(topRow, 0, 75, false)
	c.MainLayout.AddItem(bottomRow, 0, 15, false)

	// PANEL DE ESTADO (10%)
	statusText := fmt.Sprintf(" [white][Q] Salir | [C] Limpiar | [green]STREAMS ACTIVOS: %d | [blue]%s", 
		len(c.Panels), time.Now().Format("2006-01-02 15:04:05"))
	status := tview.NewTextView().SetDynamicColors(true).SetTextAlign(tview.AlignCenter).SetText(statusText)
	c.MainLayout.AddItem(status, 1, 1, false)
}

// tailLog sigue el archivo de log en tiempo real
func (c *CockpitV2) tailLog(path, id string, tv *tview.TextView, stop chan bool) {
	file, err := os.Open(path)
	if err != nil {
		fmt.Fprintf(tv, "[red]FALLO DE ACCESO: %v\n", err)
		return
	}
	defer file.Close()

	// Ir al final del archivo para monitoreo en vivo
	file.Seek(0, io.SeekEnd)
	reader := bufio.NewReader(file)

	for {
		select {
		case <-stop:
			return
		default:
			line, err := reader.ReadString('\n')
			if err != nil {
				if err == io.EOF {
					time.Sleep(500 * time.Millisecond)
					continue
				}
				return
			}

			// Formateo de colores según contenido
			processedLine := c.formatLine(line)
			fmt.Fprint(tv, processedLine)
		}
	}
}

// formatLine aplica resaltado sintáctico básico a los logs
func (c *CockpitV2) formatLine(line string) string {
	ts := time.Now().Format("15:04:05")
	upper := strings.ToUpper(line)
	
	color := "white"
	if strings.Contains(upper, "ERROR") || strings.Contains(upper, "FATAL") || strings.Contains(upper, "FAIL") {
		color = "red"
	} else if strings.Contains(upper, "SUCCESS") || strings.Contains(upper, "DONE") || strings.Contains(upper, "OK") {
		color = "green"
	} else if strings.Contains(upper, "WARN") {
		color = "yellow"
	} else if strings.Contains(line, "{") && strings.Contains(line, "}") {
		color = "blue" // JSON-like data
	}

	return fmt.Sprintf("[gray]%s [white]| [%s]%s", ts, color, line)
}

func (c *CockpitV2) createEmptyBox(msg string) *tview.Box {
	return tview.NewBox().SetBorder(true).SetTitle(fmt.Sprintf(" [gray]%s ", msg))
}