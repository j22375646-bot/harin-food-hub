begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.ai_knowledge_documents
  drop constraint if exists ai_knowledge_documents_scope_pages_check;

alter table public.ai_knowledge_documents
  add constraint ai_knowledge_documents_scope_pages_check
    check (scope_pages <@ array[
      'main','insight','keyword','product','orders','cs','inventory','settlement',
      'collection','notifications','reports','changes','validation','experiments'
    ]::text[]);

comment on column public.ai_knowledge_documents.scope_pages is
  'Allowlisted Hub pages that may use an owner-approved reference. Every page scope remains independently selectable.';

commit;
