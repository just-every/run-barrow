import { createFileRoute } from '@tanstack/react-router'
import { TradeApplication } from '../barrow/ui/apply'
export const Route=createFileRoute('/apply')({head:()=>({meta:[{title:'Trade application · Barrow'}],links:['/barrow/components.css','/barrow/shell.css','/barrow/lists.css'].map(href=>({rel:'stylesheet',href}))}),component:TradeApplication})
