import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No records found',
  className = '',
  onRowClick
}: DataTableProps<T>): React.ReactElement {
  return (
    <div className={`w-full overflow-x-auto rounded-[8px] border border-[#212327] bg-[#191919] ${className}`.trim()}>
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#212327] bg-[#1a1c20]">
            {columns.map((col) => {
              const alignClass =
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 font-mono text-xs uppercase tracking-wider text-[#7d8187] font-normal ${alignClass} ${col.className || ''}`.trim()}
                >
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-[#7d8187] font-normal"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, index) => {
              const key = keyExtractor(item, index);
              const isClickable = Boolean(onRowClick);

              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                  className={`border-b border-[#212327] last:border-b-0 transition-colors ${
                    isClickable ? 'cursor-pointer hover:bg-[#1a1c20]' : 'hover:bg-[#1a1c20]/40'
                  }`}
                >
                  {columns.map((col) => {
                    const alignClass =
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';

                    const content = col.render
                      ? col.render(item, index)
                      : (item as Record<string, unknown>)[col.key] != null
                      ? String((item as Record<string, unknown>)[col.key])
                      : '—';

                    return (
                      <td
                        key={col.key}
                        className={`px-4 py-3.5 text-[#dadbdf] ${alignClass} ${col.className || ''}`.trim()}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
