package ui

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"sentinel/internal/core"
	"strings"
	"time"

	"github.com/rivo/tview"
)

type LogStation struct {
	Layout      *tview.Flex
	Panels      map[string]*tview.TextView
	activeTails map[string]chan bool
}

func NewLogStation() *LogStation {
	return &LogStation{
		Layout:      tview.NewFlex().SetDirection(tview.FlexRow),
		Panels:      make(map[string]*tview.TextView),
		activeTails: make(map[string]chan bool),
	}
}

func (ls *LogStation) Update(tel core.TelemetryData, app *tview.Application) {
	ls.Layout.Clear()
	topRow := tview.NewFlex().SetDirection(tview.FlexColumn)
	bottomRow := tview.NewFlex().SetDirection(tview.FlexColumn)
	slots := make(map[int]*tview.TextView)

	for id, info := range tel.Streams {
		if !info.Active { continue }
		tv, exists := ls.Panels[id]
		if !exists {
			tv = tview.NewTextView().SetDynamicColors(true).SetWrap(false)
			tv.SetBorder(true).SetTitle(" " + info.Label + " ")
			tv.SetChangedFunc(func() { tv.ScrollToEnd(); app.Draw() })
			ls.Panels[id] = tv
			stop := make(chan bool); ls.activeTails[id] = stop
			go ls.tailLog(info.Path, tv, stop, app)
		}
		if info.Priority >= 1 && info.Priority <= 5 { slots[info.Priority] = tv }
	}

	ls.addSlot(topRow, slots[1], 3, "P1: PRINCIPAL")
	ls.addSlot(topRow, slots[2], 1, "P2: SECUNDARIO")
	ls.addSlot(bottomRow, slots[3], 1, "P3")
	ls.addSlot(bottomRow, slots[4], 1, "P4")
	ls.addSlot(bottomRow, slots[5], 1, "P5")
	bottomRow.AddItem(tview.NewBox().SetBorder(true), 0, 1, false)

	ls.Layout.AddItem(topRow, 0, 75, false).
		AddItem(bottomRow, 0, 15, false).
		AddItem(tview.NewBox(), 0, 10, false)
}

func (ls *LogStation) addSlot(flex *tview.Flex, tv *tview.TextView, weight int, label string) {
	if tv != nil { flex.AddItem(tv, 0, weight, false)
	} else { flex.AddItem(tview.NewBox().SetBorder(true).SetTitle(" [gray]"+label+" "), 0, weight, false) }
}

func (ls *LogStation) tailLog(path string, tv *tview.TextView, stop chan bool, app *tview.Application) {
	f, _ := os.Open(path)
	if f == nil { return }
	defer f.Close()
	f.Seek(0, io.SeekEnd)
	reader := bufio.NewReader(f)
	for {
		select {
		case <-stop: return
		default:
			line, _ := reader.ReadString('\n')
			if line == "" { time.Sleep(500 * time.Millisecond); continue }
			app.QueueUpdateDraw(func() {
				ts := time.Now().Format("15:04:05")
				color := "white"
				if strings.Contains(strings.ToUpper(line), "ERROR") { color = "red" }
				fmt.Fprintf(tv, "[gray]%s [white]| [%s]%s", ts, color, line)
			})
		}
	}
}