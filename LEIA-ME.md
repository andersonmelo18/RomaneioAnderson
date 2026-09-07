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

Com a rota **iniciada** (Confirmar): o mapa mostra um pontinho azul com a sua posição
ao vivo. Ao marcar **Entregue** ou **Não entregue**, o app já abre a próxima parada
pendente sozinho — não precisa fechar e procurar na lista. Se você tocar numa parada
fora da ordem (adiantando uma entrega que está no caminho, por exemplo), o app avisa
qual seria a próxima da sequência, mas deixa continuar do jeito que você preferir.

Menu **⋮**: reotimizar, redefinir IDs, mostrar/ocultar a linha da rota, importar outra
planilha, exportar a rota otimizada em .xlsx, imprimir e configurações.

A linha azul que liga as paradas segue as ruas de verdade (usa o serviço público
OSRM, o mesmo tipo de motor de rotas dos apps de entrega) — aparece assim que a
rota é otimizada. Se não tiver internet no momento ou o serviço estiver fora do
ar, o app não trava esperando: mostra na hora uma linha reta ligando as paradas
na ordem, e troca pela linha das ruas assim que conseguir buscar.

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
   cai longe da rota, ou quando cai longe de qualquer parada já confirmada (é o que
   pega o caso de duas ruas com o **mesmo nome** em bairros diferentes da cidade).
4. **Endereço sem número certo**: se não achar o número exato, tenta de novo só com
   o nome da rua — o pino fica marcado como "posição aproximada da rua".
5. **Último recurso**: se mesmo assim nada for encontrado, o app usa o centro das
   paradas já confirmadas do MESMO bairro da planilha (ou o centro da rota) como
   posição estimada — o pino fica apagado e pontilhado, e a parada mostra
   "posição estimada pelo bairro — confira". **A parada nunca fica sem nenhum pino**;
   só continua "sem localização" no raríssimo caso de a rota inteira ainda não ter
   nenhuma coordenada confirmada em lugar nenhum.
6. **Aviso de coordenada distante**: mesmo quando a planilha já traz Latitude/Longitude,
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
js/route/routing.js      Linha da rota seguindo as ruas de verdade (OSRM)
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
