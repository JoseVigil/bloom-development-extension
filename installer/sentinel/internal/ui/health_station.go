package ui

import (
	"fmt"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
)

type HealthStation struct {
	Layout *tview.Flex
	Table  *tview.Table
}

func NewHealthStation() *HealthStation {
	hs := &HealthStation{
		Layout: tview.NewFlex().SetDirection(tview.FlexRow),
		Table:  tview.NewTable().SetBorders(true),
	}
	hs.Layout.AddItem(hs.Table, 0, 1, true)
	return hs
}

func (hs *HealthStation) Refresh(c *core.Core) {
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	report, err := health.CheckHealth(c, sm)
	if err != nil { return }
	hs.Table.Clear()
	headers := []string{"SERVICIO", "ESTADO", "PUERTO"}
	for i, h := range headers {
		hs.Table.SetCell(0, i, tview.NewTableCell(h).SetTextColor(tcell.ColorYellow).SetAttributes(tcell.AttrBold))
	}
	for i, s := range report.Services {
		color := tcell.ColorGreen
		if !s.Active { color = tcell.ColorRed }
		hs.Table.SetCell(i+1, 0, tview.NewTableCell(s.Name))
		hs.Table.SetCell(i+1, 1, tview.NewTableCell("●").SetTextColor(color))
		hs.Table.SetCell(i+1, 2, tview.NewTableCell(fmt.Sprintf("%d", s.Port)))
	}
}