package engine

import (
	"fmt"
	"strings"

	"sqlformys/internal/domain"
)

var protocolMessageCols = []string{"__MESSAGE", "DS_MESSAGE"}
var protocolMessageTypeCols = []string{"__MESSAGE_TYPE", "TP_MESSAGE"}
var protocolCanExecuteCols = []string{"__CAN_EXECUTE", "IC_EXECUTE"}

func columnKeyMap(columns []string) map[string]string {
	out := make(map[string]string, len(columns))
	for _, c := range columns {
		out[strings.ToUpper(c)] = c
	}
	return out
}

func formatCell(v interface{}) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case []byte:
		return strings.TrimSpace(string(t))
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func firstMatchingCol(keys map[string]string, candidates []string) string {
	for _, name := range candidates {
		if k, ok := keys[strings.ToUpper(name)]; ok {
			return k
		}
	}
	return ""
}

// inferCanExecuteFromMessageColumn applies message-only validation when IC_EXECUTE is absent:
// non-empty DS_MESSAGE/__MESSAGE on the first row blocks execution; empty allows it.
func inferCanExecuteFromMessageColumn(keys map[string]string, row map[string]interface{}, canExecute *bool) *bool {
	if canExecute != nil || row == nil {
		return canExecute
	}
	msgCol := firstMatchingCol(keys, protocolMessageCols)
	if msgCol == "" {
		return nil
	}
	text := formatCell(row[msgCol])
	if text != "" {
		f := false
		return &f
	}
	t := true
	return &t
}

func parseCanExecuteValue(raw string) *bool {
	s := strings.TrimSpace(strings.ToLower(raw))
	if s == "" {
		return nil
	}
	switch s {
	case "s", "y", "1", "true", "sim", "yes", "ok":
		t := true
		return &t
	case "n", "0", "false", "nao", "não", "no":
		f := false
		return &f
	default:
		return nil
	}
}

func extractMessagesFromRow(row map[string]interface{}, keys map[string]string) []domain.UserMessage {
	msgCol := firstMatchingCol(keys, protocolMessageCols)
	if msgCol == "" {
		return nil
	}
	text := formatCell(row[msgCol])
	if text == "" {
		return nil
	}
	msgType := "WARNING"
	typeCol := firstMatchingCol(keys, protocolMessageTypeCols)
	if typeCol != "" {
		t := strings.ToUpper(formatCell(row[typeCol]))
		if _, ok := confirmTypes[t]; ok {
			msgType = t
		}
	}
	return []domain.UserMessage{{
		When:    "runtime",
		Type:    msgType,
		Message: text,
	}}
}

func protocolColumnsToRemove(keys map[string]string) map[string]bool {
	remove := make(map[string]bool)
	for _, group := range [][]string{protocolMessageCols, protocolMessageTypeCols, protocolCanExecuteCols} {
		if col := firstMatchingCol(keys, group); col != "" {
			remove[col] = true
		}
	}
	return remove
}

// ApplyResultProtocol strips protocol columns/lines and fills Messages and CanExecute on the result.
func ApplyResultProtocol(result domain.QueryResult) domain.QueryResult {
	out := result
	var messages []domain.UserMessage
	var canExecute *bool

	isStdout := len(out.Columns) == 1 && strings.EqualFold(out.Columns[0], "stdout")
	if (strings.EqualFold(out.ResultType, "TEXT") || isStdout) && len(out.Rows) > 0 {
		text := formatCell(out.Rows[0]["stdout"])
		cleaned, scriptMsgs, ce := parseScriptProtocolStdout(text)
		out.Rows = []map[string]interface{}{{"stdout": cleaned}}
		out.Columns = []string{"stdout"}
		messages = append(messages, scriptMsgs...)
		canExecute = ce
	} else if len(out.Columns) > 0 {
		keys := columnKeyMap(out.Columns)
		if len(out.Rows) > 0 {
			if execCol := firstMatchingCol(keys, protocolCanExecuteCols); execCol != "" {
				canExecute = parseCanExecuteValue(formatCell(out.Rows[0][execCol]))
				if canExecute == nil {
					// Column present but not an allow value (S/Y/1/true): block.
					f := false
					canExecute = &f
				}
			} else {
				canExecute = inferCanExecuteFromMessageColumn(keys, out.Rows[0], canExecute)
			}
		}
		removeCols := protocolColumnsToRemove(keys)
		newCols := make([]string, 0, len(out.Columns))
		for _, c := range out.Columns {
			if !removeCols[c] {
				newCols = append(newCols, c)
			}
		}
		var newRows []map[string]interface{}
		for _, row := range out.Rows {
			messages = append(messages, extractMessagesFromRow(row, keys)...)
			if len(newCols) == 0 {
				continue
			}
			dup := make(map[string]interface{}, len(newCols))
			for _, c := range newCols {
				dup[c] = row[c]
			}
			newRows = append(newRows, dup)
		}
		out.Columns = newCols
		out.Rows = newRows
	}

	if len(messages) > 0 {
		out.Messages = messages
	}
	if canExecute == nil && len(messages) > 0 {
		f := false
		canExecute = &f
	}
	if canExecute != nil {
		out.CanExecute = canExecute
	}
	return out
}

func parseScriptProtocolStdout(stdout string) (cleaned string, messages []domain.UserMessage, canExecute *bool) {
	var kept []string
	for _, line := range strings.Split(stdout, "\n") {
		trim := strings.TrimSpace(line)
		upper := strings.ToUpper(trim)
		if strings.HasPrefix(upper, "SQLFORMYS_CAN_EXECUTE=") {
			val := strings.TrimSpace(trim[len("SQLFORMYS_CAN_EXECUTE="):])
			canExecute = parseCanExecuteValue(val)
			continue
		}
		if strings.HasPrefix(upper, "SQLFORMYS_MESSAGE=") {
			rest := strings.TrimSpace(trim[len("SQLFORMYS_MESSAGE="):])
			colon := strings.Index(rest, ":")
			msgType := "WARNING"
			body := rest
			if colon >= 0 {
				t := strings.ToUpper(strings.TrimSpace(rest[:colon]))
				if _, ok := confirmTypes[t]; ok {
					msgType = t
				}
				body = strings.TrimSpace(rest[colon+1:])
			}
			if body != "" {
				messages = append(messages, domain.UserMessage{
					When:    "runtime",
					Type:    msgType,
					Message: body,
				})
			}
			continue
		}
		kept = append(kept, line)
	}
	return strings.TrimRight(strings.Join(kept, "\n"), "\n"), messages, canExecute
}

// ParseCanExecuteBool interprets a protocol can-execute flag (exported for tests).
func ParseCanExecuteBool(raw string) *bool {
	return parseCanExecuteValue(raw)
}