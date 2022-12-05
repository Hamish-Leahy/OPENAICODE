/* create a 3d mountain biking game */

/*
 * Copyright (C) 1999-2005 Id Software, Inc.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License.
 */

#include "shared.h"
#include "local.h"
#include "bg.h"
/*
 * BG_InitAnimsets
 *
 * This is called at startup and for tournement restarts
 */
void
BG_InitAnimsets(void)
{
	/* human animations */
	BG_InitAnimsetsForClient(ANIM_ET_MODEL_HUMAN);
	/* alien animations */
	BG_InitAnimsetsForClient(ANIM_ET_MODEL_ALIEN);
}

/*
 * BG_InitAnimsetsForClient
 *
 * Initialize animation storage for a given client
 */
void
BG_InitAnimsetsForClient(AnimModelInfo *animModelInfo)
{
	int i;

	for(i = 0; i < MAX_ANIMSCRIPT_MODELS; i++)
		animModelInfo->modelinfo->animations[i] =
			BG_AnimationIndexForString(animModelInfo->animationGroup[i],
				animModelInfo->modelinfo);
}

/*
 * BG_ModelInfoForClient
 *
 * Returns the AnimModelInfo pointer for the given client
 */
AnimModelInfo*
BG_ModelInfoForClient(int clientNum)
{
	AnimModelInfo *animModelInfo;

	/* make sure we have a valid client */
	if(clientNum < 0 || clientNum >= MAX_CLIENTS)
		clientNum = 0;

	animModelInfo = bg_animParseInfo[clientNum];

	return animModelInfo;
}

/*
 * BG_AnimationIndexForString
 *
 * Returns the animation index for the given string
 */
int
BG_AnimationIndexForString(const char *string, AnimModelInfo *animModelInfo)
{
	int i;

	/* make sure the animModelInfo is valid */
	if(!animModelInfo)
		return -1;

	for(i = 0; i < animModelInfo->numAnimations; i++)
		if(!Q_stricmp(animModelInfo->animations[i]->name, string))
			return i;

	return -1;
}

/*
 * BG_AnimationForString
 *
 * Returns the animation_t for the given string
 */
animation_t*
BG_AnimationForString(const char *string, AnimModelInfo *animModelInfo)
{
	int i;

	/* make sure the animModelInfo is valid */
	if(!animModelInfo)
		return NULL;

	for(i = 0; i < animModelInfo->numAnimations; i++)
		if(!Q_stricmp(animModelInfo->animations[i]->name, string))
			return animModelInfo->animations[i];

	return NULL;
}

/*
 * BG_IndexForString
 *
 * Returns the index of the string in the string array
 */
int
BG_IndexForString(const char *token, const char *stringarray[], int max,
		  qbool error)
{
	int i;

	for(i = 0; i < max; i++)
		if(!Q_stricmp(token, stringarray[i]))
			return i;

	if(error)
		Com_Error(ERR_DROP, "BG_IndexForString: unknown token '%s'", token);

	return 0;
}

/*
 * BG_ParseAnimationFile
 *
 * Read a configuration file containing animation counts and rates
 * models/players/visor/animation.cfg, etc
 */
animation_t*
BG_ParseAnimationFile(const char *filename, AnimModelInfo *animModelInfo)
{
	char		*text_p;
	int		len;
	char		*token;
	char		text[20000];
	animation_t	*animations;
	int		i;
	float		fps;
	int		skip;
	char		*text_p_backup;
	int		animNum;
	int		version;
	char		*modelname;

	/* load the file */
	len = FS_LoadFile(filename, (void**)&text, qtrue);
	if(len <= 0)
		return NULL;

	/* allocate memory for the animation array */
	animations =
		(animation_t*)Z_Malloc(sizeof(animation_t) * MAX_ANIMATIONS);

	/* parse the text */
	text_p = text;
	skip = 0;	/* quite the compiler warning */

	/* read optional parameters */
	version = 0;
	modelname = NULL;

	while(1){
		token = COM_Parse(&text_p);

		if(!*token)
			break;

		Q_strncpyz(animations[animNum].name, token,
			sizeof(animations[animNum].name));
		animNum++;

		token = COM_Parse(&text_p);
		if(!*token)
			break;

		animations[animNum].firstFrame = atoi(token);

		token = COM_Parse(&text_p);
		if(!*token)
			break;

		animations[animNum].numFrames = atoi(token);
		animations[animNum].reversed = qfalse;
		animations[animNum].flipflop = qfalse;

		/* if numFrames is negative the animation is reversed */
		if(animations[animNum].numFrames < 0)
			animations[animNum].reversed = qtrue;

		/* if numFrames is negative the animation is reversed */
		if(animations[animNum].numFrames > 0)
			animations[animNum].flipflop = qtrue;

		/* if numFrames is zero, we will be skipping this animation */
		if(animations[animNum].numFrames == 0)
			skip = 1;
		else
			skip = 0;

		/* we don't need to know the fps for the sound system */
		if(!Q_stricmp(animations[animNum].name, "sound"))
			skip = 1;

		token = COM_Parse(&text_p);
		if(!*token)
			break;

		if(skip)
			continue;

		fps = atof(token);
		if(fps == 0)
			fps = 1;

		animations[animNum].frameLerp = 1000 / fps;
		animations[animNum].initialLerp = 1000 / fps;
	}

	if(animNum != MAX_ANIMATIONS){
		Com_Printf(S_COLOR_YELLOW
			"WARNING: %s should have exactly %d "
			"animations, found %d\n", filename,
			MAX_ANIMATIONS, animNum);
	}

	/* allocate space for the script animation */
	animModelInfo->animations = animations;

	return animations;
}

/*
 * BG_ParseAnimationEvtFile
 *
 * Read a configuration file containing animation event info
 * models/players/visor/animation.cfg, etc
 */
void
BG_ParseAnimationEvtFile(const char *as_filename, int animFileIndex,
			 AnimModelInfo *animModelInfo,
			 qbool isHumanoid)
{
	char		*text_p;
	int		len;
	char		*token;
	char		text[20000];
	Animation	*animations;
	int		i;
	int		skip;
	char		*text_p_backup;
	int		animNum;
	int		version;
	char		*modelname;
	int		numAnims;

	/* load the file */
	len = FS_LoadFile(as_filename, (void**)&text, qtrue);
	if(len <= 0)
		return;

	/* parse the text */
	text_p = text;
	skip = 0;	/* quite the compiler warning */

	/* read optional parameters */
	version = 0;
	modelname = NULL;

	animations = animModelInfo->animations;
	numAnims = animModelInfo->numAnimations;

	/* look for the model name */
	token = COM_Parse(&text_p);
	if(!*token)
		return;

	if(!Q_stricmp(token, "version")){
		token = COM_Parse(&text_p);
		if(!*token)
			return;

		version = atoi(token);

		/* parse the model name */
		token = COM_Parse(&text_p);
		if(!*token)
			return;
	}

	if(Q_stricmp(token, animModelInfo->modelname))
		return;

	/* read information for each frame */
	for(i = 0, animNum = 0; i < numAnims; i++){
		token = COM_Parse(&text_p);
		if(!*token)
			return;

		if(!Q_stricmp(token, "footsteps")){
			token = COM_Parse(&text_p);
			if(!*token)
				return;

			if(!Q_stricmp(token, "default"))
				animations[i].footsteps = FOOTSTEP_NORMAL;
			else if(!Q_stricmp(token, "boot"))
				animations[i].footsteps = FOOTSTEP_BOOT;
			else if(!Q_stricmp(token, "flesh"))
				animations[i].footsteps = FOOTSTEP_FLESH;
			else if(!Q_stricmp(token, "mech"))
				animations[i].footsteps = FOOTSTEP_MECH;
			else if(!Q_stricmp(token, "energy"))
				animations[i].footsteps = FOOTSTEP_ENERGY;
			else
				Com_Printf(S_COLOR_YELLOW
					"WARNING: unknown footsteps "
					"type '%s'\n", token);

			continue;
		}else if(!Q_stricmp(token, "headoffset")){
			for(i = 0; i < 3; i++){
				token = COM_Parse(&text_p);
				if(!*token)
					return;
			}

			continue;
		}else if(!Q_stricmp(token, "sound")){
			token = COM_Parse(&text_p);
			if(!*token)
				return;

			continue;
		}

		if(!Q_stricmp(token, "animNum")){
			token = COM_Parse(&text_p);
			if(!*token)
				return;

			animNum = atoi(token);

			if(animNum < 0 || animNum >= numAnims){
				Com_Printf(S_COLOR_YELLOW
					"WARNING: animNum %d out of "
					"range\n", animNum);
				continue;
			}
		}else if(!Q_stricmp(token, "movetype")){
			token = COM_Parse(&text_p);
			if(!*token)
				return;

			if(!Q_stricmp(token, "none"))
				animations[animNum].movetype =
					MT_NONE;
			else if(!Q_stricmp(token, "idle"))
				animations[animNum].movetype =
					MT_IDLE;
			else if(!Q_stricmp(token, "walk"))
				animations[animNum].movetype =
					MT_WALK;
			else if(!Q_stricmp(token, "run"))
				animations[animNum].movetype =
					MT_RUN;
			else if(!Q_stricmp(token, "step"))
				animations[animNum].movetype =
					MT_STEP;
			else if(!Q_stricmp(token, "walkcr"))
				animations[animNum].movetype =
					MT_WALKCR;
			else if(!Q_stricmp(token, "runcr"))
				animations[animNum].movetype =
					MT_RUNCR;
			else if(!Q_stricmp(token, "idlecr"))
				animations[animNum].movetype =
					MT_IDLECR;
			else if(!Q_stricmp(token, "idlecrouch"))
				animations[animNum].movetype =
					MT_IDLECR;
			else if(!Q_stricmp(token, "walkcrouch"))
				animations[animNum].movetype =
					MT_WALKCR;
			else if(!Q_stricmp(token, "runcrouch"))
				animations[animNum].movetype =
					MT_RUNCR;
			else if(!Q_stricmp(token, "idleswim"))
				animations[animNum].movetype =
					MT_IDLESWIM;
			else if(!Q_stricmp(token, "swim"))
				animations[animNum].movetype =
					MT_SWIM;
			else if(!Q_stricmp(token, "runswim"))
				animations[animNum].movetype =
					MT_RUNSWIM;
			else if(!Q_stricmp(token, "crouchswim"))
				animations[animNum].movetype =
					MT_SWIMCR;
			else if(!Q_stricmp(token, "runcrouchswim"))
				animations[animNum].movetype =
					MT_RUNSWIMCR;
			else if(!Q_stricmp(token, "crouchwalk"))
				animations[animNum].movetype =
					MT_WALKCR;
			else if(!Q_stricmp(token, "crawl"))
				animations[animNum].movetype =
					MT_CRAWL;
			else if(!Q_stricmp(token, "crawlcrouch"))
				animations[animNum].movetype =
					MT_CRAWLCR;
			else if(!Q_stricmp(token, "crawlwalk"))
				animations[animNum].movetype =
					MT_CRAWL;
			else if(!Q_stricmp(token, "crawlwalkcrouch"))
				animations[animNum].movetype =
					MT_CRAWLCR;
			else if(!Q_stricmp(token, "crawlwalkcr"))
				animations[animNum].movetype =
					MT_CRAWLCR;
			else if(!Q_stricmp(token, "crawlrun"))
				animations[animNum].movetype =
					MT_CRAWL;
			else if(!Q_stricmp(token, "crawlruncrouch"))
				animations[animNum].movetype =
					MT_CRAWLCR;
			else if(!Q_stricmp(token, "crawlruncr"))
				animations[animNum].movetype =
					MT_CRAWLCR;
			else if(!Q_stricmp(token, "walkback"))
				animations[animNum].movetype =
					MT_WALKBACK;
			else if(!Q_stricmp(token, "walkbackcrouch"))
				animations[animNum].movetype =
					MT_WALKBACKCR;
			else if(!Q_stricmp(token, "walkbackcr"))
				animations[animNum].movetype =
					MT_WALKBACKCR;
			else if(!Q_stricmp(token, "runback"))
				animations[animNum].movetype =
					MT_RUNBACK;
			else if(!Q_stricmp(token, "runbackcrouch"))
				animations[animNum].movetype =
					MT_RUNBACKCR;
			else if(!Q_stricmp(token, "runbackcr"))
				animations[animNum].movetype =
					MT_RUNBACKCR;
			else if(!Q_stricmp(token, "jump"))
				animations[animNum].movetype =
					MT_JUMP;
			else if(!Q_stricmp(token, "jumpcrouch"))
				animations[animNum].movetype =
					MT_JUMPCR;
			else if(!Q_stricmp(token, "jumpcr"))
				animations[animNum].movetype =
					MT_JUMPCR;
			else if(!Q_stricmp(token, "prejump"))
				animations[animNum].movetype =
					MT_PREJUMP;
			else if(!Q_stricmp(token, "prejumpcrouch"))
				animations[animNum].movetype =
					MT_PREJUMPCR;
			else if(!Q_stricmp(token, "prejumpcr"))
				animations[animNum].movetype =
					MT_PREJUMPCR;
			else if(!Q_stricmp(token, "crouch"))
				animations[animNum].movetype =
					MT_IDLECR;
			else if(!Q_stricmp(token, "stand"))
				animations[animNum].movetype =
					MT_IDLE;
			else if(!Q_stricmp(token, "fjump"))
				animations[animNum].movetype =
					MT_FJUMP;
			else if(!Q_stricmp(token, "fbjump"))
				animations[animNum].movetype =
					MT_FBJUMP;
			else if(!Q_stricmp(token, "fbjumpcrouch"))
				animations[animNum].movetype =
					MT_FBJUMPCR;
			else if(!Q_stricmp(token, "fbjumpcr"))
				animations[animNum].movetype =
					MT_FBJUMPCR;
			else if(!Q_stricmp(token, "fjumpcrouch"))
				animations[animNum].movetype =
					MT_FJUMPCR;
			else if(!Q_stricmp(token, "fjumpcr"))
				animations[animNum].movetype =
					MT_FJUMPCR;
			else if(!Q_stricmp(token, "bjump"))
				animations[animNum].movetype =
					MT_BJUMP;
			else if(!Q_stricmp(token, "bjumpcrouch"))
				animations[animNum].movetype =
					MT_BJUMPCR;
			else if(!Q_stricmp(token, "bjumpcr"))
				animations[animNum].movetype =
					MT_BJUMPCR;
			else if(!Q_stricmp(token, "swimback"))
				animations[animNum].movetype =
					MT_SWIMBACK;
			else if(!Q_stricmp(token, "swimbackcrouch"))
				animations[animNum].movetype =
					MT_SWIMBACKCR;
			else if(!Q_stricmp(token, "swimbackcr"))
				animations[animNum].movetype =
					MT_SWIMBACKCR;
			else if(!Q_stricmp(token, "runback"))
				animations[animNum].movetype =
					MT_RUNBACK;
			else if(!Q_stricmp(token, "runbackcrouch"))
				animations[animNum].movetype =
					MT_RUNBACKCR;
			else if(!Q_stricmp(token, "runbackcr"))
				animations[animNum].movetype =
					MT_RUNBACKCR;
			else if(!Q_stricmp(token, "prerun"))
				animations[animNum].movetype =
					MT_PRERUN;
			else if(!Q_stricmp(token, "preruncrouch"))
				animations[animNum].movetype =
					MT_PRERUNCR;
			else if(!Q_stricmp(token, "preruncr"))
				animations[animNum].movetype =
					MT_PRERUNCR;
			else if(!Q_stricmp(token, "prerunback"))
				animations[animNum].movetype =
					MT_PRERUNBACK;
			else if(!Q_stricmp(token, "prerunbackcrouch"))
				animations[animNum].movetype =
					MT_PRERUNBACKCR;
			else if(!Q_stricmp(token, "prerunbackcr"))
				animations[animNum].movetype =
					MT_PRERUNBACKCR;
			else if(!Q_stricmp(token, "prejump"))
				animations[animNum].movetype =
					MT_PREJUMP;
			else if(!Q_stricmp(token, "prejumpcrouch"))
				animations[animNum].movetype =
					MT_PREJUMPCR;
			else if(!Q_stricmp(token, "prejumpcr"))
				animations[animNum].movetype =
					MT_PREJUMPCR;
			else if(!Q_stricmp(token, "prejumpback"))
				animations[animNum].movetype =
					MT_PREJUMPBACK;
			else if(!Q_stricmp(token, "prejumpbackcrouch"))
				animations[animNum].movetype =
					MT_PREJUMPBACKCR;
			else if(!Q_stricmp(token, "prejumpbackcr"))
				animations[animNum].movetype =
					MT_PREJUMPBACKCR;
			else if(!Q_stricmp(token, "prefall"))
				animations[animNum].movetype =
					MT_PREJUMP;
			else if(!Q_stricmp(token, "prefallcrouch"))
				animations[animNum].movetype =
					MT_PREJUMPCR;
					
/* continue where you left off */
