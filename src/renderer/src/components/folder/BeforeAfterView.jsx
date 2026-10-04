import React, { useMemo } from 'react';
import { Box, Chip, Tooltip, Typography, useTheme } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import FileIcon from './FileIcon';
import { corner, motion } from '../../theme/tokens';
import { extensionOf, folderNameFromPath, formatBytes, formatNumber, pluralize } from '../../utils/format';
import { buildOrganizationPreview, normalizePreviewName } from '../../utils/organizationPreview.mjs';

export default function BeforeAfterView({ files = [], rootPath = '', plan = {}, excluded = [] }) {
  const { palette } = useTheme();
  const c = palette.m3;

  const model = useMemo(() => buildOrganizationPreview({ files, plan, excluded }), [files, plan, excluded]);

  const movedCount = model.movedCount;
  const rootName = folderNameFromPath(rootPath) || 'Selected folder';

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: { xs: 'auto', md: 'hidden' },
        pb: 14,
        mx: -0.5,
        px: 0.5,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          gridTemplateRows: { md: 'minmax(0, 1fr)' },
          height: { md: '100%' },
          alignItems: 'stretch',
        }}
      >
        <ComparisonPane
          title="Before"
          subtitle={rootName}
          detail={`${pluralize(model.current.length, 'item')} in this folder`}
          titleTooltip={rootPath}
        >
          {model.current.length === 0 ? (
            <EmptyPane>No items are currently in this folder.</EmptyPane>
          ) : (
            <ItemList>
              {model.current.map((item) => {
                  const key = normalizePreviewName(item.name);
                  const destination = model.destinations.get(key);
                  const explicitlyKept = model.excludedByName.has(key);
                  const existingTarget = model.existingTargetNames.has(key);
                  return (
                    <ItemRow
                      key={key}
                      item={item}
                      moved={Boolean(destination)}
                      status={destination ? `Moving to ${destination}` : explicitlyKept ? 'Kept here' : existingTarget ? 'Existing destination' : null}
                      mutedStatus={(explicitlyKept || existingTarget) && !destination}
                    />
                  );
                })}
            </ItemList>
          )}
          {model.missingExcluded.length > 0 && (
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${c.outlineVariant}` }}>
              <SectionHeading label="Plan items not found in this folder" count={model.missingExcluded.length} />
              <ItemList>
                {model.missingExcluded.map((item) => (
                  <ItemRow key={`missing-${normalizePreviewName(item.name)}`} item={item} status="Staying put · source missing" warning />
                ))}
              </ItemList>
            </Box>
          )}
        </ComparisonPane>

        <ComparisonPane
          title="After applying"
          subtitle="Planned destinations"
          detail={`${pluralize(movedCount, 'item')} moving · ${pluralize(model.rootItems.length, 'item')} staying outside destinations`}
        >
          {model.rootItems.length > 0 && (
            <DestinationSection name="Stays in root" count={model.rootItems.length} staying>
              <ItemList>
                {model.rootItems.map((item) => {
                  const itemKey = normalizePreviewName(item.name);
                  const explicitlyKept = model.excludedByName.has(itemKey);
                  return (
                    <ItemRow
                      key={`root-${itemKey}`}
                      item={item}
                      status={explicitlyKept ? 'Kept here' : null}
                      mutedStatus={explicitlyKept}
                    />
                  );
                })}
              </ItemList>
            </DestinationSection>
          )}

          {model.categories.map((category) => (
            <DestinationSection
              key={normalizePreviewName(category.name)}
              name={category.name}
              count={category.items.length}
              existing={category.existing}
              conflictsWithFile={category.conflictsWithFile}
            >
              {category.items.length ? (
                <ItemList>
                  {category.items.map((item) => {
                    const current = model.byName.get(normalizePreviewName(item.name));
                    return (
                      <ItemRow
                        key={normalizePreviewName(item.name)}
                        item={current ? { ...current, type: current.type } : item}
                        moved
                        status={item.sourceMissing ? 'Not found in current folder' : 'Moving here'}
                        warning={item.sourceMissing}
                      />
                    );
                  })}
                </ItemList>
              ) : (
                <EmptyPane>Empty folder. Add items in Categories to include it.</EmptyPane>
              )}
            </DestinationSection>
          ))}

          {model.categories.length === 0 && model.rootItems.length === 0 && (
            <EmptyPane>Nothing is scheduled to move. All current items stay in place.</EmptyPane>
          )}

          <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant, px: 0.75, pt: 0.5 }}>
            Preview only. Existing folder contents stay in place when a destination folder already exists.
          </Typography>
        </ComparisonPane>
      </Box>
    </Box>
  );
}

function ComparisonPane({ title, subtitle, detail, titleTooltip, children }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <Box
      component="section"
      aria-label={`${title}: ${subtitle}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: { xs: 300, md: 0 },
        height: { md: '100%' },
        overflow: 'hidden',
        border: `1px solid ${c.outlineVariant}`,
        borderRadius: corner.xl,
        bgcolor: c.surfaceContainerLow,
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${c.outlineVariant}`, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography variant="titleMediumEmphasized" component="h3" noWrap title={titleTooltip || subtitle} sx={{ minWidth: 0, flex: 1 }}>{title} · {subtitle}</Typography>
          <Typography variant="labelMedium" title={detail} sx={{ color: c.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>{detail}</Typography>
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: { xs: 'visible', md: 'auto' }, p: 1.25 }}>
        {children}
      </Box>
    </Box>
  );
}

function DestinationSection({ name, count, existing, conflictsWithFile, staying = false, children }) {
  const { palette } = useTheme();
  const c = palette.m3;

  return (
    <Box component="section" aria-label={`${name}, ${count} planned items`} sx={{ mb: 1.25, borderRadius: corner.lg, bgcolor: c.surfaceContainer, p: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <FileIcon item={{ name, type: 'folder' }} size={30} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="titleSmall" component="h4" noWrap>{name}</Typography>
          <Typography variant="bodySmall" sx={{ color: conflictsWithFile ? c.error : c.onSurfaceVariant }} noWrap>
            {conflictsWithFile ? 'Name conflicts with a file in this folder'
              : existing ? 'Existing folder · contents stay in place'
                : staying ? 'Items stay at the current location' : pluralize(count, 'planned item')}
          </Typography>
        </Box>
        <Typography variant="labelLargeEmphasized" sx={{ minWidth: 28, height: 28, px: 1, borderRadius: corner.full, display: 'grid', placeItems: 'center', bgcolor: c.secondaryContainer, color: c.onSecondaryContainer, fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

function SectionHeading({ label, count }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
      <Typography variant="labelLarge" sx={{ color: c.onSurfaceVariant }}>{label}</Typography>
      <Typography variant="labelMedium" sx={{ color: c.onSurfaceVariant }}>{count}</Typography>
    </Box>
  );
}

function ItemList({ children }) {
  return <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>{children}</Box>;
}

function ItemRow({ item, moved = false, status = null, mutedStatus = false, warning = false }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const isFolder = item?.type === 'folder';
  const context = item?.context;
  const baseDetail = warning ? status
    : isFolder ? (context ? `${formatNumber(context.fileCount || 0)}${context.truncated ? '+' : ''} visible files inside` : 'Folder contents stay together')
      : [extensionOf(item?.name).toUpperCase() || 'File', formatBytes(item?.size)].join(' · ');
  const detail = item?.hidden && !warning ? `Hidden · ${baseDetail}` : baseDetail;

  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: 0,
        px: 1,
        py: 0.75,
        borderRadius: corner.md,
        borderLeft: `3px solid ${moved ? c.primary : 'transparent'}`,
        bgcolor: moved ? c.surfaceContainer : c.surfaceContainerLowest,
        transition: motion.effects(['background-color', 'border-left-color']),
      }}
    >
      <FileIcon item={item} size={28} radius={corner.sm} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="bodyMedium" component="p" noWrap title={item?.name} sx={{ color: c.onSurface }}>{item?.name || 'Unnamed item'}</Typography>
        <Typography variant="bodySmall" component="p" noWrap sx={{ color: warning ? c.error : c.onSurfaceVariant }}>{detail}</Typography>
      </Box>
      {status && (
        <Tooltip title={status} enterDelay={500}>
          <Chip
            size="small"
            icon={moved ? <ArrowForwardRoundedIcon /> : undefined}
            label={status}
            color={warning ? 'error' : mutedStatus ? 'default' : moved ? 'primary' : 'default'}
            variant={moved ? 'filled' : 'outlined'}
            sx={{ maxWidth: '48%', flexShrink: 0, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
          />
        </Tooltip>
      )}
    </Box>
  );
}

function EmptyPane({ children }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <Typography variant="bodySmall" sx={{ px: 1, py: 1.5, color: c.onSurfaceVariant }}>
      {children}
    </Typography>
  );
}
