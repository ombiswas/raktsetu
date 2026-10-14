import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type Column } from '../DataTable.js';

interface TestDonor {
  id: string;
  bloodGroup: string;
  distanceKm: number;
  status: string;
}

describe('DataTable Primitive', () => {
  const columns: Column<TestDonor>[] = [
    { key: 'bloodGroup', header: 'BLOOD GROUP' },
    { key: 'distanceKm', header: 'DISTANCE', render: (row) => `~${row.distanceKm} km` },
    { key: 'status', header: 'STATUS' }
  ];

  const data: TestDonor[] = [
    { id: '1', bloodGroup: 'O+', distanceKm: 3.2, status: 'AVAILABLE' },
    { id: '2', bloodGroup: 'A+', distanceKm: 5.1, status: 'NOTIFIED' }
  ];

  it('renders table headers and rows with mono uppercase headers', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={(d) => d.id} />);

    expect(screen.getByText('BLOOD GROUP')).toBeInTheDocument();
    expect(screen.getByText('DISTANCE')).toBeInTheDocument();
    expect(screen.getByText('~3.2 km')).toBeInTheDocument();
    expect(screen.getByText('~5.1 km')).toBeInTheDocument();
  });

  it('renders empty message when dataset is empty', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        keyExtractor={(d) => d.id}
        emptyMessage="No donors currently in dispatch queue"
      />
    );

    expect(screen.getByText('No donors currently in dispatch queue')).toBeInTheDocument();
  });

  it('triggers onRowClick when row is selected', async () => {
    const user = userEvent.setup();
    const handleRowClick = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={data}
        keyExtractor={(d) => d.id}
        onRowClick={handleRowClick}
      />
    );

    const firstRowCell = screen.getByText('~3.2 km');
    await user.click(firstRowCell);
    expect(handleRowClick).toHaveBeenCalledWith(data[0]);
  });
});
