# Orçamento em PDF para enviar no WhatsApp

Boa ideia — PDF é o melhor formato: abre direto no WhatsApp, dá pra imprimir e passa uma imagem mais profissional que um texto longo.

Um detalhe importante: o link `wa.me` só consegue levar **texto**, nunca um arquivo anexado. Então o fluxo funciona assim:

- **No celular** (maioria dos clientes): botão "Enviar orçamento" gera o PDF e abre o menu nativo de compartilhamento já com o arquivo — o cliente toca em WhatsApp, escolhe seu contato e envia. Um toque, arquivo anexado.
- **No computador** (ou celular sem suporte): o PDF é baixado automaticamente e o WhatsApp Web abre com uma mensagem resumida pronta; o cliente só arrasta/anexa o PDF baixado.

## O documento

PDF em A4, com a identidade do catálogo (verde/preto/branco):

- Cabeçalho: nome do representante, contato e data do orçamento
- Dados do cliente (nome, negócio, público-alvo, verba informada)
- Tabela dos itens: código, produto, linha, marca, coletivo/pack, quantidade, preço unitário e total do item
- Agrupamento por marca (Belliz / Payot) e por curva A/B/C
- Rodapé: total geral, quantidade de itens, resumo da distribuição ABC e observação de que preços podem variar
- Numeração de páginas para orçamentos longos

Nome do arquivo: `Orcamento-<nome-do-cliente>-<data>.pdf`.

## Onde aparece

- Página **/curva-a**, na tela de resultado: o botão atual de WhatsApp passa a gerar o PDF + compartilhar, e adiciono um botão secundário "Baixar PDF" para quem só quer o arquivo.
- Mesmo botão de PDF no carrinho da home (pedido por marca), para o fluxo ficar igual nos dois lugares.

## Detalhes técnicos

- Bibliotecas `jspdf` + `jspdf-autotable` (geração 100% no navegador, sem backend nem custo).
- Novo módulo `src/lib/quote-pdf.ts` com uma função que recebe os itens + dados do cliente e devolve um `Blob`, reaproveitada pelas duas telas.
- Envio: `navigator.canShare({ files })` → `navigator.share`; fallback para download via `URL.createObjectURL` + abertura do `wa.me` com a mensagem-resumo atual.
- Textos da mensagem de WhatsApp ficam curtos (resumo + total), já que o detalhamento vai no PDF.
