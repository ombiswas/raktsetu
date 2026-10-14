import React, { useState } from 'react';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Select } from '../../components/ui/Select.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { Card } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { DataTable, type Column } from '../../components/ui/DataTable.js';
import { Modal } from '../../components/ui/Modal.js';
import { Toast } from '../../components/ui/Toast.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Spinner } from '../../components/ui/Spinner.js';

interface SampleRow {
  token: string;
  role: string;
  hexValue: string;
}

const COLOR_TOKENS: SampleRow[] = [
  { token: 'canvas', role: 'Page Ground Canvas', hexValue: '#0a0a0a' },
  { token: 'canvas-soft', role: 'Elevated Surface / Field Fill', hexValue: '#1a1c20' },
  { token: 'canvas-card', role: 'Default Card Background', hexValue: '#191919' },
  { token: 'canvas-mid', role: 'Dividers / Mid Neutral', hexValue: '#363a3f' },
  { token: 'hairline', role: 'Hairline Elevation Border', hexValue: '#212327' },
  { token: 'primary / ink', role: 'Primary CTA Fill & Text Ink', hexValue: '#ffffff' },
  { token: 'body', role: 'Running Body Text', hexValue: '#dadbdf' },
  { token: 'body-mid / mute', role: 'Labels & Secondary Copy', hexValue: '#7d8187' },
  { token: 'accent-sunset', role: 'Urgent / Critical Semantic State', hexValue: '#ff7a17' },
  { token: 'accent-sunset-soft', role: 'Urgent Text & Highlights', hexValue: '#ffc285' },
  { token: 'accent-breeze', role: 'Informational Semantic State', hexValue: '#a0c3ec' },
  { token: 'accent-dusk', role: 'Secondary Accent', hexValue: '#7c3aed' },
  { token: 'accent-twilight', role: 'Soft Dusk Accent', hexValue: '#c4b5fd' },
  { token: 'accent-midnight', role: 'Deep Informational Fill', hexValue: '#0d1726' }
];

const TABLE_COLUMNS: Column<SampleRow>[] = [
  { key: 'token', header: 'TOKEN NAME', render: (r) => <span className="font-mono text-xs">{r.token}</span> },
  { key: 'role', header: 'SEMANTIC ROLE' },
  {
    key: 'hexValue',
    header: 'HEX SWATCH',
    align: 'right',
    render: (r) => (
      <div className="flex items-center justify-end gap-2">
        <span
          className="w-4 h-4 rounded-full border border-[#212327]"
          style={{ backgroundColor: r.hexValue }}
          aria-hidden="true"
        />
        <span className="font-mono text-xs">{r.hexValue}</span>
      </div>
    )
  }
];

export function DesignCheckPage(): React.ReactElement {
  const [modalOpen, setModalOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');

  return (
    <div className="flex flex-col gap-10 max-w-5xl mx-auto pb-16">
      {/* Dev Notice */}
      <div className="bg-[#1a1c20] border border-[#ff7a17] p-4 rounded-[8px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="urgent" dot>
            DEV ROUTE ONLY
          </Badge>
          <span className="text-xs text-[#dadbdf] font-mono">
            /design-check is excluded from production bundles. Visual primitive audit.
          </span>
        </div>
        <Eyebrow variant="sunset">PHASE 10 VERIFICATION</Eyebrow>
      </div>

      {/* 1. Design Token Color Ladder */}
      <section className="flex flex-col gap-4">
        <div>
          <Eyebrow size="sm">COLOR PALETTE AUDIT</Eyebrow>
          <h2 className="text-xl font-normal text-[#ffffff]">Canonical Hex Token Swatches</h2>
          <p className="text-xs text-[#7d8187] mt-1">
            Zero stray colors allowed. Strictly dark canvas, hairline elevation rules, and sunset/breeze semantic accents.
          </p>
        </div>

        <DataTable
          columns={TABLE_COLUMNS}
          data={COLOR_TOKENS}
          keyExtractor={(r) => r.token}
        />
      </section>

      {/* 2. Typography Ladder */}
      <section className="flex flex-col gap-4">
        <div>
          <Eyebrow size="sm">TYPOGRAPHY LADDER (INTER SUBSTITUTION)</Eyebrow>
          <h2 className="text-xl font-normal text-[#ffffff]">Negative Display Tracking & Monospace</h2>
        </div>

        <Card>
          <div className="flex flex-col gap-6">
            <div>
              <div className="text-xs font-mono text-[#7d8187] mb-1">.display-xl (96px, letterSpacing: -2.4px, weight: 400)</div>
              <div className="display-xl text-[#ffffff]">RaktSetu</div>
            </div>

            <div>
              <div className="text-xs font-mono text-[#7d8187] mb-1">.display-lg (72px, letterSpacing: -1.8px, weight: 400)</div>
              <div className="display-lg text-[#ffffff]">Emergency Match</div>
            </div>

            <div>
              <div className="text-xs font-mono text-[#7d8187] mb-1">.display-md (48px, letterSpacing: -1.2px, weight: 400)</div>
              <div className="display-md text-[#ffffff]">Prioritization Engine</div>
            </div>

            <div>
              <div className="text-xs font-mono text-[#7d8187] mb-1">.display-sm (32px, letterSpacing: -0.6px, weight: 400)</div>
              <div className="display-sm text-[#ffffff]">Geospatial PostGIS Bounding</div>
            </div>

            <div>
              <div className="text-xs font-mono text-[#7d8187] mb-1">.display-xs (20px, letterSpacing: 0, weight: 400)</div>
              <div className="display-xs text-[#ffffff]">Deterministic Hard Biological Constraints First</div>
            </div>

            <div className="pt-4 border-t border-[#212327] flex flex-wrap gap-4 items-center">
              <Eyebrow variant="default">EYEBROW DEFAULT</Eyebrow>
              <Eyebrow variant="sunset">EYEBROW SUNSET CRITICAL</Eyebrow>
              <Eyebrow variant="breeze">EYEBROW BREEZE INFO</Eyebrow>
              <span className="caption-mono text-[#ffffff]">CAPTION MONO UPPERCASE TRACKED</span>
            </div>
          </div>
        </Card>
      </section>

      {/* 3. Button Primitives */}
      <section className="flex flex-col gap-4">
        <div>
          <Eyebrow size="sm">CANONICAL BUTTON SYSTEM</Eyebrow>
          <h2 className="text-xl font-normal text-[#ffffff]">Pill Buttons with Clear Elevation</h2>
        </div>

        <Card>
          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="primary">Primary White-Filled Pill</Button>
            <Button variant="outline">Outline Pill</Button>
            <Button variant="outline-sm">Small Outline</Button>
            <Button variant="primary" isLoading>
              Loading State
            </Button>
            <Button variant="primary" disabled>
              Disabled Pill
            </Button>
          </div>
        </Card>
      </section>

      {/* 4. Form Primitives */}
      <section className="flex flex-col gap-4">
        <div>
          <Eyebrow size="sm">ACCESSIBLE FORM CONTROLS</Eyebrow>
          <h2 className="text-xl font-normal text-[#ffffff]">Label & Error Wiring (aria-describedby)</h2>
        </div>

        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TextInput
              label="Volunteer Donor Name"
              placeholder="e.g. Om Biswas"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (e.target.value.length < 3) {
                  setInputError('Name must be at least 3 characters');
                } else {
                  setInputError('');
                }
              }}
              error={inputError || undefined}
              helperText="Full legal name for blood-bank cross-verification"
              required
            />

            <Select
              label="Blood Type Group"
              options={[
                { value: 'O_NEG', label: 'O- (Universal Red Cell)' },
                { value: 'O_POS', label: 'O+' },
                { value: 'A_POS', label: 'A+' }
              ]}
              helperText="ABO / Rh statutory classification"
            />

            <div className="md:col-span-2">
              <Textarea
                label="Clinical Dispatch Triage Notes"
                placeholder="Trauma emergency unit notes..."
                helperText="Exact coordinates are cloaked automatically by the PostGIS engine."
                rows={3}
              />
            </div>
          </div>
        </Card>
      </section>

      {/* 5. Status Badges */}
      <section className="flex flex-col gap-4">
        <div>
          <Eyebrow size="sm">STATUS BADGES</Eyebrow>
          <h2 className="text-xl font-normal text-[#ffffff]">Semantic Pill Badges with Hairline Borders</h2>
        </div>

        <Card>
          <div className="flex flex-wrap gap-4 items-center">
            <Badge variant="neutral">NEUTRAL STATUS</Badge>
            <Badge variant="neutral" dot>
              NEUTRAL WITH DOT
            </Badge>
            <Badge variant="urgent" dot>
              URGENT SUNSET
            </Badge>
            <Badge variant="info" dot>
              INFORMATIONAL BREEZE
            </Badge>
            <Badge variant="success" dot>
              FULFILLED SUCCESS
            </Badge>
          </div>
        </Card>
      </section>

      {/* 6. Modal & Toast Dialog Walkthrough */}
      <section className="flex flex-col gap-4">
        <div>
          <Eyebrow size="sm">INTERACTIVE ACCESSIBILITY REVIEW</Eyebrow>
          <h2 className="text-xl font-normal text-[#ffffff]">Modal Focus Trap & Toast Notification</h2>
        </div>

        <Card>
          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              Open Focus Trap Modal
            </Button>

            <Button variant="outline" onClick={() => setShowToast(!showToast)}>
              Trigger Urgent Toast
            </Button>
          </div>
        </Card>

        {showToast && (
          <Toast
            title="Emergency Match Found"
            description="Donor accepted request req-001 within ~3.5 km. Contact phone number uncloaked."
            variant="urgent"
            onDismiss={() => setShowToast(false)}
          />
        )}

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Keyboard Accessibility Walkthrough"
          description="Try tabbing through elements. Tab wraps at the end; Escape closes the dialog; focus returns to trigger."
          footer={
            <>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                Confirm Action
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-xs text-[#dadbdf]">
              This modal dialog implements WAI-ARIA 1.2 modal dialog patterns with an active focus trap
              and Escape key dismissal.
            </p>
            <TextInput label="Sample Modal Input" placeholder="Type here..." />
          </div>
        </Modal>
      </section>

      {/* 7. Feedback Primitives */}
      <section className="flex flex-col gap-4">
        <div>
          <Eyebrow size="sm">FEEDBACK & LOADING PRIMITIVES</Eyebrow>
          <h2 className="text-xl font-normal text-[#ffffff]">EmptyState, Skeleton, and Hairline Spinners</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EmptyState
            eyebrow="ZERO PENDING REQUESTS"
            title="All Clear in Spatial Sector"
            description="No active emergency blood requests match your current spatial radius."
            action={<Button variant="outline-sm">Refresh Radius</Button>}
          />

          <Card className="flex flex-col gap-4 justify-center">
            <div>
              <div className="text-xs font-mono text-[#7d8187] mb-2">Skeletons (Pulse)</div>
              <div className="flex flex-col gap-2">
                <Skeleton width="100%" height={32} />
                <Skeleton width="75%" height={20} />
                <Skeleton width="50%" height={20} />
              </div>
            </div>

            <div className="pt-4 border-t border-[#212327]">
              <div className="text-xs font-mono text-[#7d8187] mb-2">Spinners (Hairline)</div>
              <div className="flex items-center gap-4">
                <Spinner size="sm" label="Small loading" />
                <Spinner size="md" label="Medium loading" />
                <Spinner size="lg" label="Large loading" />
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

export default DesignCheckPage;
