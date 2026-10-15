import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { PendingAccountsQueue } from './PendingAccountsQueue.js';
import { AuditLogViewer } from './AuditLogViewer.js';

export function AdminPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'accounts' | 'audit'>('accounts');
  const navigate = useNavigate();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <Eyebrow variant="sunset" className="mb-1">
            SECURITY & GOVERNANCE CONSOLE
          </Eyebrow>
          <h1 className="text-2xl font-bold text-canvas-fg tracking-tight">
            System Administration & Audit Console
          </h1>
          <p className="text-xs text-body-mid mt-1">
            Review organization registration queues, revoke compromised sessions, and inspect immutable audit event records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/analytics')}>
            Analytics Overview
          </Button>
          <Button variant="outline" onClick={() => navigate('/blood-bank/forecast')}>
            Demand Forecasting
          </Button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-hairline">
        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'accounts'
              ? 'border-accent-sunset text-canvas-fg font-bold'
              : 'border-transparent text-body-mid hover:text-canvas-fg'
          }`}
        >
          Pending Accounts & Moderation
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'audit'
              ? 'border-accent-sunset text-canvas-fg font-bold'
              : 'border-transparent text-body-mid hover:text-canvas-fg'
          }`}
        >
          Immutable Audit Trail
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'accounts' ? (
        <PendingAccountsQueue />
      ) : (
        <AuditLogViewer />
      )}
    </div>
  );
}

export default AdminPage;
