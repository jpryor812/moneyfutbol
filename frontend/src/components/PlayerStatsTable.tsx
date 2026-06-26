import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HoverTip } from './HoverTip'
import { parseNum } from '../lib/csv'
import {
  columnHint,
  columnLabel,
  isSortableColumn,
  orderColumns,
  PINNED,
  renderCell,
} from '../lib/tableColumns'
import { playerPath } from '../lib/playerRoute'
import { useForwardsCsv } from '../lib/useForwardsCsv'

type SortDir = 'asc' | 'desc'

type Props = {
  rows: Record<string, string>[]
  columns: string[]
  defaultSortCol?: string
  defaultSortDir?: SortDir
  linkPlayers?: boolean
  hideColumns?: string[]
}

export function PlayerStatsTable({
  rows,
  columns,
  defaultSortCol = 'season_end_year',
  defaultSortDir = 'asc',
  linkPlayers = false,
  hideColumns = [],
} : Props) {
  const { study } = useForwardsCsv()
  const [sortCol, setSortCol] = useState(defaultSortCol)
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir)

  const orderedCols = useMemo(() => {
    return orderColumns(columns).filter((c) => !hideColumns.includes(c))
  }, [columns, hideColumns])

  const sorted = useMemo(() => {
    const col = sortCol
    return [...rows].sort((a, b) => {
      const av = a[col] ?? ''
      const bv = b[col] ?? ''
      const an = parseNum(av)
      const bn = parseNum(bv)
      let cmp: number
      if (an != null && bn != null) cmp = an - bn
      else cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortCol, sortDir])

  function toggleSort(col: string) {
    if (col === sortCol) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortCol(col)
      setSortDir(
        col === 'player' || col === 'team' || col === 'season_end_year' ? 'asc' : 'desc',
      )
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="max-h-[calc(100vh-16rem)] overflow-auto">
        <table className="w-max min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-pitch-800/95 backdrop-blur">
            <tr>
              {orderedCols.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap border-b border-pitch-600/50 px-3 py-2 font-semibold text-pitch-400"
                >
                  {isSortableColumn(col) ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className="flex items-center gap-1 hover:text-chalk"
                    >
                      <HoverTip text={columnHint(col)}>{columnLabel(col)}</HoverTip>
                      {sortCol === col && (
                        <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                  ) : (
                    <HoverTip text={columnHint(col)}>{columnLabel(col)}</HoverTip>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`${row.player}-${row.team}-${row.season_end_year}-${i}`}
                className="border-b border-pitch-700/30 hover:bg-pitch-700/20"
              >
                {orderedCols.map((col) => (
                  <td
                    key={col}
                    className={`whitespace-nowrap px-3 py-1.5 ${
                      PINNED.includes(col) ? 'text-chalk' : 'stat-num text-fair'
                    } ${col === 'player' ? 'font-medium' : ''}`}
                  >
                    {col === 'player' && linkPlayers && row.player ? (
                      <Link
                        to={playerPath(study.slug, row.player)}
                        className="text-pitch-400 underline decoration-pitch-600/60 underline-offset-2 hover:text-pitch-300"
                      >
                        {row.player}
                      </Link>
                    ) : (
                      renderCell(col, row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
