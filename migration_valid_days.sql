-- ================================================================
-- MIGRAÇÃO — Dias de resgate dos prêmios
-- Execute no SQL Editor do Supabase
-- ================================================================

-- Adiciona coluna valid_days em prizes
-- Array de números: 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta,
--                   4=Quinta, 5=Sexta, 6=Sábado
-- NULL = todos os dias permitidos
ALTER TABLE prizes
  ADD COLUMN IF NOT EXISTS valid_days integer[] DEFAULT NULL;

-- Exemplos:
-- Todos os dias:        NULL
-- Só fim de semana:     ARRAY[0, 6]
-- Sex e Sáb:            ARRAY[5, 6]
-- Seg a Sex:            ARRAY[1, 2, 3, 4, 5]
