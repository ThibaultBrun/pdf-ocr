# PDF OCR Browser

Application web `Vite + Vue 3 + TypeScript` pour transformer un PDF scanne en PDF OCR avec texte selectionnable, sans backend.

## Commandes

```bash
npm install
npm run dev
npm run build
```

## Fonctionnalites

- Upload PDF par drag and drop ou selection fichier
- Miniatures et navigation page par page
- Rendu des pages via `pdf.js`
- OCR francais via `Tesseract.js`
- Progression globale et par page
- Annulation de l'OCR
- Edition manuelle du texte OCR
- Export `TXT`
- Export `JSON`
- Export `PDF OCR`
- Export `ZIP` contenant `TXT + JSON + PDF OCR`
- Import d'un JSON OCR precedemment sauvegarde
- Option de nettoyage d'image avant OCR
- Option de debug avec texte visible dans le PDF exporte

## Architecture

- `src/main.ts`
- `src/App.vue`
- `src/services/pdfService.ts`
- `src/services/ocrService.ts`
- `src/services/exportService.ts`
- `src/types.ts`

## Notes

- `Tesseract.js` utilise ses propres Web Workers. L'UI reste reactive pendant l'OCR, meme si le traitement d'un document long reste couteux.
- Les pages sont traitees de maniere sequentielle pour limiter l'usage memoire sur des PDF de 20+ pages.
- Le pretraitement optionnel applique un passage grayscale/contraste sur le canvas avant OCR.

## Limites connues

- L'alignement de la couche texte invisible du PDF exporte reste approximatif. Il s'appuie sur les boites de lignes detectees par `Tesseract.js` et sur une mise a l'echelle simple dans `pdf-lib`.
- Si le texte OCR est fortement corrige a la main, les positions initiales ne correspondent plus parfaitement au texte edite.
- Les PDF lourds peuvent consommer beaucoup de RAM car chaque page est rasterisee dans le navigateur.
- Certains navigateurs ou environnements limites peuvent bloquer les workers ou les fichiers volumineux.
