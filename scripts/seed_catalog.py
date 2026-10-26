"""Maintain explicit teaching resources; never load pickle files in production.
These are catalogue candidates, not a claim of current availability or objective quality.
"""
import json
from pathlib import Path
GROUPS = {
'python': [
('_uQrJ0TkZlc','Python Tutorial — Full Course for Beginners','Programming with Mosh','en','python programming variables functions classes'),
('XKHEtdqhLK8','Python Full Course for Beginners','Bro Code','en','python programming exercises projects functions'),
('gfDE2a7MKjA','Python Tutorial for Beginners in Hindi','CodeWithHarry','hi','python programming hindi basics projects'),
('kqtD5dpn9C8','Python for Beginners — Learn Python in 1 Hour','Programming with Mosh','en','python basics variables loops functions'),
('8DvywoWv6fI','Python for Everybody — Full University Course','freeCodeCamp.org','en','python programming data networking databases'),
('sCOw5y1RQpY','Python Full Tutorial for Beginners','WsCube Tech','hi','python programming hindi basics'),
('WGJJIrtnfpk','Python Full Course','edureka!','en','python programming tutorial beginners')],
'web': [
('HcOc7P5BMi4','HTML Tutorial for Beginners','Apna College','hi','html web development website forms semantic'),
('oYRda7UtuhA','Responsive Multi-page Website with HTML and CSS','Easy Tutorials','en','web development html css responsive project'),
('qz0aGYrrlhU','HTML Tutorial for Beginners','Programming with Mosh','en','web html basics website'),
('Rek0NWPCNOc','HTML Course — Beginner to Advanced','Apna College','hi','html web development basics'),
('6mbwJ2xhgzM','Introduction to HTML, CSS and JavaScript','CodeWithHarry','hi','web development html css javascript basics'),
('Q33KBiDriJY','Web Development Full Course','edureka!','en','web development html css javascript full course'),
('G3e-cpL7ofc','HTML & CSS Full Course — Beginner to Pro','SuperSimpleDev','en','web development html css responsive exercises')],
'java': [
('yRpLlJmRo2w','Introduction to Java Language','Apna College','hi','java programming basics introduction'),
('UmnCZ7-9yDY','Java Tutorial for Beginners','Apna College','hi','java programming basics tutorial'),
('xk4_1vDrzzo','Java Full Course for Beginners','Bro Code','en','java programming classes objects exercises'),
('eIrMbAQSU34','Java Tutorial for Beginners','Programming with Mosh','en','java programming basics classes objects'),
('8cm1x4bC610','Java Tutorial for Beginners — Full Course','Telusko','en','java programming object oriented classes'),
('RRubcjpTkks','Learn Java in 14 Minutes','Alex Lee','en','java programming basics short introduction')],
'ml': [
('aircAruvnKk','But What Is a Neural Network?','3Blue1Brown','en','machine learning neural networks deep learning intuition'),
('IHZwWFHWa-w','Gradient Descent, How Neural Networks Learn','3Blue1Brown','en','machine learning neural networks gradient descent training'),
('ukzFI9rgwfU','Machine Learning Basics','Simplilearn','en','machine learning introduction supervised unsupervised basics'),
('7eh4d6sabA0','Machine Learning for Everybody — Full Course','freeCodeCamp.org','en','machine learning python scikit learn regression classification'),
('rfscVS0vtbw','Learn Python — Full Course for Beginners','freeCodeCamp.org','en','python programming prerequisite machine learning basics')],
'sql': [
('HXV3zeQKqGY','SQL Tutorial — Full Database Course for Beginners','freeCodeCamp.org','en','sql database queries joins tables relational'),
('7S_tz1z_5bA','MySQL Tutorial for Beginners','Programming with Mosh','en','sql mysql database queries joins tutorial'),
('hlGoQC332VM','SQL Tutorial for Beginners','Apna College','hi','sql database queries tables joins basics'),
('p3qvj9hO_Bo','SQL Full Course','Bro Code','en','sql mysql database queries tutorial'),
('qw--VYLpxG4','SQL Tutorial — Full Course','Amigoscode','en','sql postgres database queries tutorial')],
'linux': [
('sWbUDq4S6Y8','Linux Command Line Tutorial for Beginners','freeCodeCamp.org','en','linux terminal bash shell commands permissions networking'),
('ZtqBQ68cfJc','Linux for Beginners','Programming with Mosh','en','linux terminal commands shell basics'),
('oxuRxtrO2Ag','Bash Scripting Tutorial for Beginners','freeCodeCamp.org','en','linux bash shell scripting automation'),
('tK9Oc6AEnR4','Introduction to Linux — Full Course','freeCodeCamp.org','en','linux terminal system administration networking'),
('v-F3YLd6oMw','Linux Operating System — Crash Course for Beginners','freeCodeCamp.org','en','linux operating system terminal basics')],
'dsa': [
('8hly31xKli0','Algorithms and Data Structures — Full Course','freeCodeCamp.org','en','data structures algorithms arrays linked lists sorting searching'),
('RBSGKlAvoiM','Data Structures — Full Course Using C and C++','freeCodeCamp.org','en','data structures algorithms arrays stacks queues trees'),
('pkYVOmU3MgA','Data Structures and Algorithms in Python','freeCodeCamp.org','en','data structures algorithms python sorting searching'),
('CBYHwZcbD-s','Big O Notation — Full Course','freeCodeCamp.org','en','algorithms complexity big o time space'),
('09_LlHjoEiY','Data Structures and Algorithms in JavaScript','freeCodeCamp.org','en','data structures algorithms javascript stack queue tree')]
}
rows=[]
for topic,videos in GROUPS.items():
 for video_id,title,channel,language,tags in videos:
  rows.append(dict(id=video_id,title=title,channel=channel,language=language,topic=topic,tags=tags,level='beginner',duration=None,description='',source='catalogue'))
Path('api/catalog.json').write_text(json.dumps(rows,indent=2)+'\n')
print(f'{len(rows)} catalogue candidates across {len(GROUPS)} topics')
