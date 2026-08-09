'use client';

import { useState } from 'react';

import type { CreateDesignTemplateBody } from '@embroidery/api-client';

import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';
import { useCreateDesignTemplate } from '../hooks/use-create-design-template';
import { useDesignTemplateFilters } from '../hooks/use-design-template-filters';
import { useTemplateProductOptions } from '../hooks/use-template-product-options';
import { CreateDesignTemplateDialog } from './create-design-template-dialog';
import { DesignTemplateCollection } from './design-template-collection';
import { DesignTemplateFilterBar } from './design-template-filter-bar';

/**
 * `/design-templates` — the Admin Design Template list (`596:8`).
 *
 * Composition and the create flow, nothing else. The filter state lives in the
 * URL and the collection owns its own query, so this component holds no data
 * and no derived list state.
 *
 * Exactly one write reaches the server from this screen: `adminDesignTemplate_create`.
 * There is no publish, unpublish, archive or restore control anywhere — those
 * are `APP3-A04`'s, and a lifecycle button on a list is how a destructive
 * transition gets triggered from a row the operator was only skimming.
 */
export function DesignTemplateListScreen() {
  const { filters, setStatus, setProduct } = useDesignTemplateFilters();
  const products = useTemplateProductOptions();
  const create = useCreateDesignTemplate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const openDialog = () => {
    create.reset();
    setCreated(null);
    setDialogOpen(true);
  };

  const submit = (body: CreateDesignTemplateBody) => {
    create.mutate(body, {
      onSuccess: (template) => {
        setDialogOpen(false);
        // The create response is a *detail* view, so "no version yet" is a fact
        // the server actually stated here rather than one the list inferred.
        setCreated(template.name);
      },
      // No `onError`: the dialog stays open, the form keeps what the operator
      // typed, and the mutation's own error drives the message.
    });
  };

  return (
    <section className="design-templates">
      <header className="design-templates__header">
        <div className="design-templates__heading">
          <h1 className="design-templates__title">{DESIGN_TEMPLATE_COPY.page.title}</h1>
          <button
            type="button"
            className="design-templates__create"
            data-testid="template-create-open"
            onClick={openDialog}
          >
            {DESIGN_TEMPLATE_COPY.actions.create}
          </button>
        </div>
        {/*
          The approved frames carry different subtitles at 1440 and 390. Exactly
          one is ever rendered: the stylesheet hides the other with
          `display: none`, which removes it from the accessibility tree too.
        */}
        <p className="design-templates__subtitle design-templates__subtitle--wide">
          {DESIGN_TEMPLATE_COPY.page.subtitleWide}
        </p>
        <p className="design-templates__subtitle design-templates__subtitle--narrow">
          {DESIGN_TEMPLATE_COPY.page.subtitleNarrow}
        </p>
      </header>

      {created === null ? null : (
        <p className="design-templates__created" role="status" data-testid="template-created">
          {DESIGN_TEMPLATE_COPY.create.created(created)}
        </p>
      )}

      <DesignTemplateFilterBar
        filters={filters}
        products={products}
        onStatusChange={setStatus}
        onProductChange={setProduct}
      />

      <DesignTemplateCollection filters={filters} products={products} onCreate={openDialog} />

      {dialogOpen ? (
        <CreateDesignTemplateDialog
          submitting={create.isPending}
          failure={create.error}
          onClose={() => {
            setDialogOpen(false);
          }}
          onSubmit={submit}
        />
      ) : null}
    </section>
  );
}
