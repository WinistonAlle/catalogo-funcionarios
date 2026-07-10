-- Sequência para gerar o código do pedido no CIGAM (campo Codigo, curto).
-- O order_number completo (GM-...) vai na observação do pedido; o vínculo
-- fica em orders.erp_external_id. Faixa 9xxxxx para não colidir com os
-- códigos gerados pela tela do CIGAM.
CREATE SEQUENCE IF NOT EXISTS cigam_order_code_seq START 900001;

CREATE OR REPLACE FUNCTION next_cigam_order_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT nextval('cigam_order_code_seq')::text;
$$;
