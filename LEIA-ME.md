# Roteirizador SPX

Roteirizador de entregas no mesmo fluxo do aplicativo Spoke, com uma aba a mais:
a criação da planilha a partir do romaneio digitado.

## Como usar

Abra o arquivo **`index.html`** (dois cliques). Não precisa instalar nada, nem internet
para funcionar — só para carregar o mapa e localizar endereços novos.

### Aba "Rota"

1. **Importar planilha** → o app pergunta, como no Spoke, quais informações extras você
   quer ver ao chegar em cada parada (as caixas começam desmarcadas).
2. A lista aparece com as paradas na sequência original e os pinos no mapa.
3. **Otimizar rota** → calcula a melhor ordem partindo do seu GPS, mostra quanto
   economizou e o tempo total previsto.
4. **Refinar** → ajusta a ordem na mão com as setas. **Confirmar** → inicia a rota.
5. Toque em uma parada para abrir: **Navegar**, **Não entregue**, **Entregue**,
   editar, duplicar ou remover.

Menu **⋮**: reotimizar, redefinir IDs, mostrar/ocultar a linha da rota, importar outra
planilha, exportar a rota otimizada em .xlsx, imprimir e configurações.

### Aba "Criar planilha"

Cole o romaneio (com ou sem a coluna `Stop`), confira a prévia e:

- **Gerar planilha (.xlsx)** — no formato oficial, para arquivar ou importar depois;
- **Usar esta rota agora** — manda direto para a aba Rota, sem exportar/importar.

A coluna `Stop` é calculada sozinha: pacotes no mesmo endereço ficam na mesma parada.

### Aba "Teste de precisão"

Envie a planilha oficial (a que já tem Latitude/Longitude) e o app usa essas
coordenadas como gabarito para medir, em metros, o erro da busca gratuita de
endereços. Serve para você decidir se vale a pena configurar uma chave do Google.

## De onde vem a posição dos pinos

1. **A planilha já traz Latitude/Longitude** (caso da planilha oficial): usa direto.
   Pino exato, nenhuma busca, instantâneo.
2. **Com chave do Google** (opcional, em Configurações): o mapa e a busca passam a ser
   os do Google — mesma precisão do Spoke.
3. **Sem chave**: busca gratuita no OpenStreetMap, com um filtro que **recusa** o
   resultado quando ele é o centro do bairro, quando a rua devolvida é outra, quando
   o bairro devolvido não bate com o esperado, quando cai longe da rota, quando cai
   longe de qualquer parada já confirmada (é o que pega o caso de duas ruas com o
   **mesmo nome** em bairros diferentes da cidade), ou quando ruas diferentes caem
   no mesmo ponto.
   O que não passa no filtro fica marcado como "sem localização" na lista —
   **nunca é plotado num lugar errado**.
4. **Aviso de coordenada distante**: mesmo quando a planilha já traz Latitude/Longitude,
   se algum endereço cair bem longe do resto da rota, o pino aparece em laranja com
   borda tracejada e a parada mostra "⚠️ longe do resto da rota — confira", em vez de
   simplesmente confiar cegamente no que veio no arquivo.

## Estrutura dos arquivos

```
index.html               Aba Rota (mapa + paradas)
criar-planilha.html      Aba Criar planilha (romaneio → xlsx)
teste-precisao.html      Aferição da precisão do geocodificador

css/theme.css            Cores dos dois temas (laranja Shopee / azul Spoke)
css/app.css              Base: barra, botões, cartões, modais
css/route.css            Telas do roteirizador (mapa, painel, wizard, impressão)
css/builder.css          Tela de criação de planilha

js/core/utils.js         Funções auxiliares (texto, distância, formatação)
js/core/columns.js       Reconhecimento das colunas da planilha
js/core/settings.js      Configurações (tema, chave, ritmo, ponto de partida)
js/core/sheet-io.js      Leitura e escrita de .xlsx

js/route/model.js        Estado da rota: paradas, ordem, IDs, status
js/route/optimizer.js    Ordem de visita (vizinho mais próximo + 2-opt) e horários
js/route/geocoder.js     Busca de endereço + filtro de sanidade
js/route/map.js          Mapa (Leaflet/OSM ou Google, conforme a chave)
js/route/ui-import.js    Wizard de importação
js/route/ui-list.js      Lista de paradas
js/route/ui-stop.js      Painel de detalhe da parada
js/route/app.js          Máquina de telas: vazio → planejando → prévia → ativa

js/builder/builder.js    Romaneio → planilha
vendor/                  Bibliotecas (SheetJS e Leaflet), embutidas no projeto
```

## Configurações

Engrenagem no canto superior direito:

- **Tema**: laranja Shopee ou azul Spoke.
- **Ponto de partida**: GPS, endereço fixo (galpão) ou primeira parada.
- **Chave do Google Maps** (opcional): liga mapa e precisão do Google.
- **Velocidade média** e **tempo por entrega**: ajustam a estimativa de horário.

Essas preferências ficam salvas no navegador. Nenhum endereço ou dado de entrega
é guardado.
