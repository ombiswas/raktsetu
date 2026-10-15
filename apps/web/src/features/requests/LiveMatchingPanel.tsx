import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import type { MatchingStatusData, MatchingCandidate } from './request-types.js';

interface LiveMatchingPanelProps {
  matchingData: MatchingStatusData;
  unitsRequired: number;
  unitsFulfilled: number;
}

export function LiveMatchingPanel({
  matchingData,
  unitsRequired,
  unitsFulfilled
}: LiveMatchingPanelProps): React.ReactElement {
  // Track which candidate items have their "Why this order" accordion expanded
  const [expandedCandidateIds, setExpandedCandidateIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isDegraded = Boolean(matchingData.degraded || matchingData.algorithm === 'baseline');
  const counts = matchingData.candidateCounts;
  const config = matchingData.config;

  const currentRadiusKm = config.finalRadiusMeters
    ? (config.finalRadiusMeters / 1000).toFixed(1)
    : '5.0';

  return (
    <div className="flex flex-col gap-6">
      {/* Degraded Mode Notice Banner */}
      {isDegraded && (
        <div
          role="alert"
          aria-label="Degraded dispatch mode notification"
          className="p-4 bg-accent-sunset/10 border border-accent-sunset/40 rounded-lg space-y-1.5"
        >
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-accent-sunset">
            <span className="w-2 h-2 rounded-full bg-accent-sunset animate-pulse" />
            DEGRADED MODE ACTIVE: PROXIMITY FALLBACK
          </div>
          <p className="text-xs text-body">
            Candidate prioritization fell back to deterministic proximity ranking because the machine
            learning inference service is currently unavailable or circuit is open. Biological compatibility
            and clinical eligibility constraints remain 100% active.
          </p>
        </div>
      )}

      {/* Model & Algorithm Meta Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-canvas-card border border-hairline rounded-lg text-xs font-mono">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-body-mid">ALGORITHM: </span>
            <span className="text-canvas-fg font-medium uppercase">{matchingData.algorithm}</span>
            <span className="text-body-mid ml-1">({matchingData.algorithmVersion})</span>
          </div>
          <div className="border-l border-hairline pl-4">
            <span className="text-body-mid">MODEL VERSION: </span>
            <span className="text-canvas-fg">
              {matchingData.modelVersion || 'None (Proximity Baseline)'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={isDegraded ? 'urgent' : 'success'} dot>
            {isDegraded ? 'DEGRADED PROXIMITY' : 'HYBRID CALIBRATED ML'}
          </Badge>
          <Badge variant="neutral">SIMULATION</Badge>
        </div>
      </div>

      {/* Dispatch Progress and Candidate Counts Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-center">
        <div className="p-3 bg-canvas-card border border-hairline rounded-lg">
          <div className="text-lg font-bold text-canvas-fg">
            {unitsFulfilled} / {unitsRequired}
          </div>
          <div className="text-[10px] text-body-mid mt-0.5 uppercase">UNITS FULFILLED</div>
        </div>

        <div className="p-3 bg-canvas-card border border-hairline rounded-lg">
          <div className="text-lg font-bold text-canvas-fg">{counts.total}</div>
          <div className="text-[10px] text-body-mid mt-0.5 uppercase">TOTAL NOTIFIED</div>
        </div>

        <div className="p-3 bg-canvas-card border border-hairline rounded-lg">
          <div className="text-lg font-bold text-accent-sunset">{counts.accepted}</div>
          <div className="text-[10px] text-body-mid mt-0.5 uppercase">ACCEPTED</div>
        </div>

        <div className="p-3 bg-canvas-card border border-hairline rounded-lg">
          <div className="text-lg font-bold text-body-mid">{counts.declined}</div>
          <div className="text-[10px] text-body-mid mt-0.5 uppercase">DECLINED</div>
        </div>

        <div className="p-3 bg-canvas-card border border-hairline rounded-lg">
          <div className="text-lg font-bold text-body-mid">{counts.noResponse}</div>
          <div className="text-[10px] text-body-mid mt-0.5 uppercase">NO RESPONSE</div>
        </div>

        <div className="p-3 bg-canvas-card border border-hairline rounded-lg">
          <div className="text-lg font-bold text-canvas-fg">{currentRadiusKm} km</div>
          <div className="text-[10px] text-body-mid mt-0.5 uppercase">SEARCH RADIUS</div>
        </div>
      </div>

      {/* Candidates Ranking Radar List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <Eyebrow size="sm">CANDIDATE DISPATCH RADAR</Eyebrow>
              <CardTitle>Anonymized Candidate Prioritization</CardTitle>
              <CardDescription>
                Candidates passing 100% of deterministic biological hard gates, ordered by response likelihood.
              </CardDescription>
            </div>
            <div className="text-xs font-mono text-body-mid">
              Batch 1 Size: {config.batchSize ?? 5} candidates
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {matchingData.candidates.length === 0 ? (
              <div className="text-center py-8 text-xs font-mono text-body-mid">
                No eligible donors found within current search radius ({currentRadiusKm} km).
              </div>
            ) : (
              matchingData.candidates.map((cand: MatchingCandidate) => {
                const isExpanded = expandedCandidateIds.has(cand.id);

                const statusBadge =
                  cand.responseStatus === 'accepted' ? (
                    <Badge variant="urgent" dot>
                      ACCEPTED
                    </Badge>
                  ) : cand.responseStatus === 'declined' ? (
                    <Badge variant="neutral">DECLINED</Badge>
                  ) : cand.responseStatus === 'no_response' ? (
                    <Badge variant="neutral">TIMED OUT</Badge>
                  ) : (
                    <Badge variant="info" dot>
                      NOTIFIED
                    </Badge>
                  );

                return (
                  <div
                    key={cand.id}
                    className="p-4 bg-canvas-soft border border-hairline rounded-lg transition-colors hover:border-canvas-mid"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-canvas-card border border-hairline font-mono text-xs font-bold text-canvas-fg flex items-center justify-center">
                          #{cand.rank}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-canvas-fg">
                              Candidate {cand.id.slice(0, 8)}...
                            </span>
                            <span className="font-mono text-xs text-body-mid font-medium px-1.5 py-0.5 rounded bg-canvas-card border border-hairline">
                              {cand.bloodGroup}
                            </span>
                          </div>
                          <div className="text-xs text-body-mid mt-0.5">
                            Approx Distance: <span className="font-mono text-canvas-fg">{cand.approximateDistance}</span>
                            <span className="text-[11px] text-body-mid ml-2 italic">
                              (Zero exact coordinates revealed)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        {statusBadge}
                        <Button
                          variant="outline-sm"
                          onClick={() => toggleExpand(cand.id)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? 'Hide Details' : 'Why this order?'}
                        </Button>
                      </div>
                    </div>

                    {/* Expandable "Why this order" Section */}
                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-hairline text-xs space-y-2">
                        <div className="flex items-center gap-2 font-mono text-[11px] text-accent-sunset">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-sunset" />
                          MODEL OUTPUT (SIMULATION)
                        </div>

                        {cand.score != null ? (
                          <div className="bg-canvas-card p-3 rounded border border-hairline space-y-1.5 font-mono text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-body-mid">P(response | donor, request, context):</span>
                              <span className="text-canvas-fg font-bold">
                                {(cand.score * 100).toFixed(1)}% ({cand.score.toFixed(4)})
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-body-mid">DETERMINISTIC GATES:</span>
                              <span className="text-canvas-fg">100% Passed (ABO/Rh, Weight, Cooldown)</span>
                            </div>
                            <div className="text-body-mid text-[10px] mt-1 italic">
                              Score synthesizes historical acceptance rate, response latency, travel distance band, and current time-of-day affinity.
                            </div>
                          </div>
                        ) : (
                          <div className="bg-canvas-card p-3 rounded border border-hairline font-mono text-[11px] text-body-mid">
                            PROXIMITY BASELINE RANKING: Candidate ordered strictly by travel distance band. Zero machine learning probability applied.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default LiveMatchingPanel;
