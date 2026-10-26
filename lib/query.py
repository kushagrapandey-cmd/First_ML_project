"""Normalize explicit technology names without pretending to translate all Hindi."""
import re
import unicodedata
ALIASES={'पायथन':'python','पाइथन':'python','जावा':'java','एसक्यूएल':'sql','एस क्यू एल':'sql','लिनक्स':'linux','कुबेरनेटिस':'kubernetes','कुबरनेट्स':'kubernetes','कुबेरनेट्स':'kubernetes','जावास्क्रिप्ट':'javascript','एचटीएमएल':'html','डॉकर':'docker','टेबल':'table'}
TECHNOLOGIES={'python','java','sql','linux','bash','kubernetes','docker','html','css','javascript','react','terraform','postgresql'}
def normalize(text):
 text=unicodedata.normalize('NFKC',text).casefold()
 for source,target in ALIASES.items():text=text.replace(source,target)
 return ' '.join(text.split())
def anchored(rows,query):
 anchors=set(re.findall(r'[a-z0-9]+',query))&TECHNOLOGIES
 if not anchors:return rows
 return [row for row in rows if anchors & set(re.findall(r'[a-z0-9]+',' '.join([row['title'],row.get('tags','')]).casefold()))]
